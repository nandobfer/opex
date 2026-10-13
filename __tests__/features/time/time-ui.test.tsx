/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeLogDto } from '@/features/time/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete } }))

import { TimerProvider } from '@/features/time/components/TimerProvider'
import { TimerIndicator } from '@/features/time/components/TimerIndicator'
import { TimeLogItem } from '@/features/time/components/TimeLogItem'
import { TimeLogTaskGroup } from '@/features/time/components/TimeLogTaskGroup'
import type { TimeLogTask } from '@/features/time/grouping'
import { formatCostUsd, formatTokens } from '@/features/time/format'
import { activeTimersKey } from '@/features/time/hooks/useTime'

const A = 'a'.repeat(24)
const log = (overrides: Partial<TimeLogDto> = {}): TimeLogDto => ({
  id: 'c'.repeat(24),
  taskId: A,
  workbenchId: 'wb-1',
  taskCode: 'OPX-1',
  taskTitle: 'Primeira',
  stage: 'implementing',
  agent: 'build',
  model: 'openai/gpt',
  startTime: new Date(Date.now() - 65_000).toISOString(),
  endTime: null,
  duration: null,
  costUsd: 0.5,
  inputTokens: 120,
  outputTokens: 45,
  reasoningTokens: 10,
  description: 'Desenvolvimento agêntico · Implementando',
  active: true,
  ...overrides,
})
const ok = (data: unknown) => ({ data: { success: true, data } })

async function renderWith(active: TimeLogDto[], children: React.ReactNode) {
  mocks.get.mockImplementation(async (url: string) => (url === '/time/active' ? ok(active) : ok(null)))
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

describe('formatação de uso', () => {
  it('tokens em forma curta e custo em dólares', () => {
    expect(formatTokens(175)).toBe('175')
    expect(formatTokens(1500)).toBe('1,5k')
    expect(formatTokens(2_400_000)).toBe('2,4M')
    expect(formatCostUsd(0.5)).toContain('0,50')
  })
})

describe('controle de horas é somente leitura', () => {
  it('sem períodos ativos o indicador não aparece', async () => {
    await renderWith([], <TimerIndicator />)
    expect(screen.queryByRole('button', { name: /Trabalho em andamento/ })).toBeNull()
  })

  it('indicador mostra o cronômetro e abre o resumo (sem ação de parar)', async () => {
    await renderWith([log()], <TimerIndicator />)
    const button = await screen.findByRole('button', { name: 'Trabalho em andamento em OPX-1' })
    expect(button.textContent).toMatch(/00:01:0\d/)
    fireEvent.click(button)
    expect(await screen.findByText('Trabalhos em andamento')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Parar/ })).toBeNull()
  })

  it('o popover "Trabalhos em andamento" se dimensiona pelo conteúdo (sem largura fixa)', async () => {
    await renderWith([log()], <TimerIndicator />)
    fireEvent.click(await screen.findByRole('button', { name: 'Trabalho em andamento em OPX-1' }))
    const popover = await screen.findByTestId('in-progress-popover')
    expect(popover.className).toContain('w-max')
    expect(popover.className).toContain('max-w-[calc(100vw-2rem)]')
    expect(popover.className).not.toContain('w-80')
    expect(popover.className).not.toContain('w-72')
  })

  it('não existem botões de iniciar/parar timer na interface', async () => {
    await renderWith([log()], <TimerIndicator />)
    expect(screen.queryByRole('button', { name: /Iniciar o timer|Parar o timer/ })).toBeNull()
    expect(mocks.post).not.toHaveBeenCalled()
  })
})

describe('TimeLogItem (Horas agênticas)', () => {
  it('mostra tarefa, descrição e uso (agente/modelo/tokens/custo) sem ações', () => {
    render(<TimeLogItem log={log({ active: false, endTime: new Date().toISOString(), duration: 90 })} />)
    expect(screen.getByRole('link', { name: 'OPX-1' }).getAttribute('href')).toBe(`/tarefas/${A}`)
    expect(screen.getByText('1h 30min')).toBeTruthy()
    expect(screen.getByText('Desenvolvimento agêntico · Implementando')).toBeTruthy()
    expect(screen.getByText('build')).toBeTruthy()
    expect(screen.getByText('openai/gpt')).toBeTruthy()
    expect(screen.getByText(/175 tokens/)).toBeTruthy()
    expect(screen.getByText(/0,50/)).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

function GroupHarness({ group }: { group: TimeLogTask }) {
  const [open, setOpen] = React.useState(false)
  return <TimeLogTaskGroup group={group} open={open} onToggle={() => setOpen((value) => !value)} />
}

describe('TimeLogTaskGroup (agrupamento por task/mesa)', () => {
  const group = (overrides: Partial<TimeLogTask> = {}): TimeLogTask => ({
    key: A,
    taskId: A,
    taskCode: 'OPX-1',
    taskTitle: 'Primeira',
    logs: [log({ active: false, endTime: '2026-10-10T10:30:00.000Z', duration: 30 })],
    totalMinutes: 30,
    totalTokens: 0,
    totalCostUsd: 0,
    hasActive: false,
    ...overrides,
  })

  it('começa recolhido e revela os apontamentos ao clicar no cabeçalho', () => {
    render(<GroupHarness group={group()} />)
    const header = screen.getByRole('button', { name: /OPX-1/ })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Desenvolvimento agêntico · Implementando')).toBeNull()

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Desenvolvimento agêntico · Implementando')).toBeTruthy()

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Desenvolvimento agêntico · Implementando')).toBeNull()
  })

  it('mostra a contagem de apontamentos e o total de minutos no cabeçalho', () => {
    render(
      <GroupHarness
        group={group({
          logs: [
            log({ active: false, endTime: '2026-10-10T10:30:00.000Z', duration: 30 }),
            log({ id: 'd'.repeat(24), active: false, endTime: '2026-10-10T09:15:00.000Z', duration: 15 }),
          ],
          totalMinutes: 45,
        })}
      />,
    )
    expect(screen.getByText('2 apontamentos')).toBeTruthy()
    expect(screen.getByText('45min')).toBeTruthy()
  })

  it('sinaliza o grupo com período ativo como "Em execução"', () => {
    render(<GroupHarness group={group({ logs: [log()], totalMinutes: 0, hasActive: true })} />)
    expect(screen.getByText('Em execução')).toBeTruthy()
  })

  it('mostra o consumo de tokens e o custo somados no cabeçalho', () => {
    render(<GroupHarness group={group({ totalTokens: 175, totalCostUsd: 0.5 })} />)
    expect(screen.getByText(/175 tokens/)).toBeTruthy()
    expect(screen.getByText(/0,50/)).toBeTruthy()
  })

  it('não mostra tokens nem custo quando o grupo não tem uso', () => {
    render(<GroupHarness group={group()} />)
    expect(screen.queryByText(/tokens/)).toBeNull()
    expect(screen.queryByText(/US\$/)).toBeNull()
  })

  it('no celular o consumo/total do grupo vai para uma linha própria (não espreme o título)', () => {
    render(<GroupHarness group={group({ totalMinutes: 45, totalTokens: 175, totalCostUsd: 0.5 })} />)
    const metrics = screen.getByTestId('time-group-metrics')
    expect(metrics.className).toContain('max-md:basis-full')
    expect(metrics.className).toContain('max-md:justify-start')
  })
})

describe('TimeLogItem no celular', () => {
  it('o período/duração vai para uma linha própria, abaixo do conteúdo', () => {
    render(<TimeLogItem log={log({ active: false, endTime: new Date().toISOString(), duration: 90 })} />)
    const period = screen.getByTestId('time-log-period')
    expect(period.className).toContain('max-md:basis-full')
    expect(period.className).toContain('max-md:justify-between')
  })
})
