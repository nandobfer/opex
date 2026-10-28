/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InProgressWorkbenchDto } from '@/features/agentic/types'
import type { TimeLogDto } from '@/features/time/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete } }))

import { WorkbenchProgressProvider } from '@/features/agentic/components/WorkbenchProgressProvider'
import { TimerProvider } from '@/features/time/components/TimerProvider'
import { TimerIndicator } from '@/features/time/components/TimerIndicator'

const TASK = 'a'.repeat(24)
const ok = (data: unknown) => ({ data: { success: true, data } })

const workbench = (overrides: Partial<InProgressWorkbenchDto> = {}): InProgressWorkbenchDto => ({
  workbenchId: 'wb-1',
  centralId: 'c1',
  taskId: TASK,
  taskCode: 'OPX-1',
  taskTitle: 'Primeira',
  stage: 'plan_review',
  runState: 'idle',
  running: false,
  waitingFor: 'Aguardando revisão do plano',
  ...overrides,
})

const log = (overrides: Partial<TimeLogDto> = {}): TimeLogDto => ({
  id: 'c'.repeat(24),
  taskId: TASK,
  workbenchId: 'wb-1',
  taskCode: 'OPX-1',
  taskTitle: 'Primeira',
  stage: 'implementing',
  agent: 'build',
  model: 'openai/gpt',
  startTime: new Date(Date.now() - 65_000).toISOString(),
  endTime: null,
  duration: null,
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  description: null,
  active: true,
  ...overrides,
})

async function renderWith({ active = [], items = [] }: { active?: TimeLogDto[]; items?: InProgressWorkbenchDto[] }) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/time/active') return ok(active)
    if (url === '/agentic/workbenches/in-progress') return ok(items)
    return ok(null)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={client}>
      <TimerProvider>
        <WorkbenchProgressProvider>
          <TimerIndicator />
        </WorkbenchProgressProvider>
      </TimerProvider>
    </QueryClientProvider>,
  )
  await waitFor(() => expect(client.getQueryData(['agentic', 'workbenches', 'in-progress'])).toBeDefined())
  return result
}

beforeEach(() => vi.clearAllMocks())

describe('trabalhos em andamento: mesas pausadas continuam na lista', () => {
  it('mesa aguardando ação aparece em warning, com o motivo e o link para a mesa', async () => {
    await renderWith({ items: [workbench()] })
    const button = await screen.findByRole('button', { name: 'Aguardando ação em OPX-1' })
    expect(button.className).toContain('text-warning')

    fireEvent.click(button)
    expect(await screen.findByText('Trabalhos em andamento')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Abrir a mesa de OPX-1' })
    expect(link.getAttribute('href')).toBe(`/desenvolvimento/${TASK}`)
    expect(screen.getByText('Aguardando revisão do plano')).toBeTruthy()
  })

  it('mesa executando mostra o cronômetro e também navega para a mesa', async () => {
    const item = workbench({ running: true, waitingFor: null, stage: 'implementing', runState: 'running' })
    await renderWith({ items: [item], active: [log()] })
    const button = await screen.findByRole('button', { name: 'Trabalho em andamento em OPX-1' })
    expect(button.className).toContain('text-success')
    expect(button.textContent).toMatch(/00:01:0\d/)

    fireEvent.click(button)
    const link = await screen.findByRole('link', { name: 'Abrir a mesa de OPX-1' })
    expect(link.getAttribute('href')).toBe(`/desenvolvimento/${TASK}`)
    expect(screen.getByText('Em execução')).toBeTruthy()
  })

  it('falha aparece em destructive com o motivo de ação', async () => {
    await renderWith({ items: [workbench({ runState: 'failed', stage: 'implementing', running: false, waitingFor: 'A etapa falhou — use Tentar novamente' })] })
    fireEvent.click(await screen.findByRole('button', { name: 'Aguardando ação em OPX-1' }))
    expect(await screen.findByText('A etapa falhou — use Tentar novamente')).toBeTruthy()
  })

  it('sem trabalhos em andamento o indicador não aparece', async () => {
    await renderWith({})
    expect(screen.queryByRole('button', { name: /Trabalho em andamento|Aguardando ação/ })).toBeNull()
  })
})
