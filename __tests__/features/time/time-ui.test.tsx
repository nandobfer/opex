/** @vitest-environment jsdom */

import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeLogDto } from '@/features/time/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: vi.fn() } }))
vi.mock('sonner', () => ({ toast: mocks.toast }))

import { TimerProvider } from '@/features/time/components/TimerProvider'
import { TimerButton } from '@/features/time/components/TimerButton'
import { TimerIndicator } from '@/features/time/components/TimerIndicator'
import { TimeLogItem } from '@/features/time/components/TimeLogItem'
import { groupTimeLogsByDay } from '@/features/time/grouping'
import { formatClock } from '@/features/time/format'
import { stopTimerFormSchema } from '@/features/time/schemas'
import { activeTimersKey } from '@/features/time/hooks/useTime'

const A = 'a'.repeat(24)
const B = 'b'.repeat(24)
const log = (overrides: Partial<TimeLogDto> = {}): TimeLogDto => ({
  id: 'c'.repeat(24),
  taskId: A,
  taskCode: 'GO-DEV-1',
  taskTitle: 'Primeira',
  productName: 'GO',
  startTime: new Date(Date.now() - 65_000).toISOString(),
  endTime: null,
  duration: null,
  description: null,
  active: true,
  ...overrides,
})
const ok = (data: unknown) => ({ data: { success: true, data } })

/** `server.active` = o que o Go! Sipal devolve em /time/active (muda ao longo do teste). */
const server = { active: [] as TimeLogDto[] }

async function renderWith(active: TimeLogDto[], children: React.ReactNode) {
  server.active = active
  mocks.get.mockImplementation(async (url: string) => (url === '/time/active' ? ok(server.active) : ok(null)))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={client}>
      <TimerProvider>{children}</TimerProvider>
    </QueryClientProvider>,
  )
  await waitFor(() => expect(client.getQueryData(activeTimersKey)).toBeDefined())
  return result
}

beforeEach(() => vi.clearAllMocks())

describe('formatação e agrupamento', () => {
  it('formatClock e grupos por dia (mais recente primeiro, total dos encerrados)', () => {
    expect(formatClock(3725)).toBe('01:02:05')
    const days = groupTimeLogsByDay([
      log({ id: '1', startTime: '2026-10-07T13:00:00', duration: 30, active: false }),
      log({ id: '2', startTime: '2026-10-08T09:00:00', duration: 45, active: false }),
      log({ id: '3', startTime: '2026-10-07T15:00:00', duration: 15, active: false }),
    ])
    expect(days.map((day) => [day.key, day.logs.map((l) => l.id), day.totalMinutes])).toEqual([
      ['2026-10-08', ['2'], 45],
      ['2026-10-07', ['3', '1'], 45],
    ])
    expect(days[0]!.label).toMatch(/^Quinta-feira, 08 de outubro/)
  })

  it('modal de parar: ajustar horários valida fim depois do início e nada no futuro', () => {
    expect(stopTimerFormSchema.safeParse({ adjust: false, startTime: '', endTime: '', description: '' }).success).toBe(true)
    const bad = stopTimerFormSchema.safeParse({ adjust: true, startTime: '2026-10-08T10:00', endTime: '2026-10-08T09:00', description: '' })
    expect(bad.success).toBe(false)
    expect(bad.error?.issues[0]?.message).toBe('Fim deve ser depois do início')
    const future = stopTimerFormSchema.safeParse({ adjust: true, startTime: '2020-01-01T10:00', endTime: '2999-01-01T10:00', description: '' })
    expect(future.error?.issues[0]?.message).toBe('Fim não pode ser no futuro')
  })
})

describe('TimerButton + TimerProvider', () => {
  it('sem timer ativo: ▶ inicia no Go! Sipal (e o botão vira ⏸)', async () => {
    const started = log({ id: 'd'.repeat(24) })
    mocks.post.mockImplementation(async () => {
      server.active = [started]
      return ok(started)
    })
    await renderWith([], <TimerButton task={{ id: A, code: 'GO-DEV-1', title: 'Primeira' }} />)
    const button = await screen.findByRole('button', { name: 'Iniciar o timer de GO-DEV-1' })
    await act(async () => fireEvent.click(button))
    expect(mocks.post).toHaveBeenCalledWith('/time/start', { taskId: A })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Parar o timer de GO-DEV-1' })).toBeTruthy())
  })

  it('timer da tarefa rodando: ⏸ abre o modal "Parar timer" e confirma no Go! Sipal', async () => {
    const running = log()
    mocks.post.mockResolvedValue(ok({ ...running, active: false, endTime: new Date().toISOString(), duration: 1 }))
    await renderWith([running], <TimerButton task={{ id: A, code: 'GO-DEV-1', title: 'Primeira' }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Parar o timer de GO-DEV-1' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Parar timer' })).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('Descrição do trabalho realizado (opcional)'), { target: { value: 'Revisei o login' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: /Parar timer/ })))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(`/time/${running.id}/stop`, expect.objectContaining({ description: 'Revisei o login' })))
  })

  it('um timer por vez: iniciar outra tarefa pede para parar a atual e depois inicia', async () => {
    const running = log()
    mocks.post.mockImplementation(async (url: string) =>
      url === '/time/start' ? ok(log({ id: 'e'.repeat(24), taskId: B, taskCode: 'GO-DEV-2' })) : ok({ ...running, active: false, endTime: new Date().toISOString(), duration: 1 }),
    )
    await renderWith([running], <TimerButton task={{ id: B, code: 'GO-DEV-2', title: 'Segunda' }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar o timer de GO-DEV-2' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('GO-DEV-2')
    expect(mocks.post).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: /Parar e iniciar/ })))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/time/start', { taskId: B }))
    expect(mocks.post.mock.calls[0][0]).toBe(`/time/${running.id}/stop`)
  })

  it('erro ao parar fica no modal (não fecha)', async () => {
    const running = log()
    mocks.post.mockRejectedValue(Object.assign(new Error('400'), { isAxiosError: true, response: { status: 400, data: { success: false, error: 'Data de fim não pode ser no futuro' } } }))
    await renderWith([running], <TimerButton task={{ id: A, code: 'GO-DEV-1', title: 'Primeira' }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Parar o timer de GO-DEV-1' }))
    const dialog = await screen.findByRole('dialog')
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: /Parar timer/ })))
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('Data de fim não pode ser no futuro'))
  })

  it('indicador do topo: aparece com timer ativo e abre o modal de parar', async () => {
    await renderWith([], <TimerIndicator />)
    expect(screen.queryByRole('button', { name: /Trabalho em andamento/ })).toBeNull()
  })

  it('indicador do topo com timer: cronômetro e clique abre o modal', async () => {
    await renderWith([log()], <TimerIndicator />)
    const button = await screen.findByRole('button', { name: 'Trabalho em andamento em GO-DEV-1: parar' })
    expect(button.textContent).toMatch(/00:01:0\d/)
    fireEvent.click(button)
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('fora do provider o botão não aparece', () => {
    render(<TimerButton task={{ id: A, code: 'GO-DEV-1', title: 'x' }} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('TimeLogItem (Minhas horas)', () => {
  it('editar descrição na linha; ativo mostra Parar e não permite excluir', async () => {
    const onSave = vi.fn(async () => true)
    const onStop = vi.fn()
    const { rerender } = render(
      <TimeLogItem log={log({ active: false, endTime: new Date().toISOString(), duration: 90 })} savingDescription={false} onSaveDescription={onSave} onEditPeriod={vi.fn()} onDelete={vi.fn()} onStop={onStop} />,
    )
    expect(screen.getByText('1h 30min')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'GO-DEV-1' }).getAttribute('href')).toBe(`/tarefas/${A}`)
    fireEvent.click(screen.getByTitle('Editar descrição'))
    fireEvent.change(screen.getByLabelText('Descrição do apontamento'), { target: { value: 'Ajuste fino' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar descrição' })))
    expect(onSave).toHaveBeenCalledWith('Ajuste fino')

    rerender(<TimeLogItem log={log()} savingDescription={false} onSaveDescription={onSave} onEditPeriod={vi.fn()} onDelete={vi.fn()} onStop={onStop} />)
    fireEvent.click(screen.getByRole('button', { name: /Parar/ }))
    expect(onStop).toHaveBeenCalled()
  })
})
