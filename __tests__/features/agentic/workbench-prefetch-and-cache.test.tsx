/** @vitest-environment happy-dom */

import React from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-188 (revisão F3): pré-busca da mesa ao parar o mouse numa tarefa (atraso, cancelar ao sair,
 * mesa fresca não é buscada de novo) e a saída guardada esquecida ao excluir a mesa ou descartar o fork.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn() }))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: { get: mocks.get, delete: mocks.del },
}))

import { agenticKey, PREFETCH_WORKBENCH_DELAY_MS, useDeleteWorkbench, usePrefetchWorkbench } from '@/features/agentic/hooks/useAgentic'
import { useDiscardFork } from '@/features/agentic/hooks/useForks'
import { clearTimelineCache, readTimelineCache, writeTimelineCache } from '@/features/agentic/timeline-cache'
import type { ForkDto, WorkbenchDto } from '@/features/agentic/types'

const loaded = { items: [{ kind: 'text' as const, key: 'x', text: 'a' }], reasoning: false, loaded: true }

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearTimelineCache()
  mocks.get.mockImplementation(async (path: string) => ({ data: { success: true, data: { id: 'w', taskId: path.split('/').pop() } } }))
  mocks.del.mockResolvedValue({ data: { success: true, data: { deleted: true } } })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('usePrefetchWorkbench', () => {
  it('só busca quem para em cima (atraso) e sair antes cancela', async () => {
    vi.useFakeTimers()
    const { wrapper } = setup()
    const { result } = renderHook(() => usePrefetchWorkbench(), { wrapper })
    act(() => result.current.schedule('t1'))
    act(() => vi.advanceTimersByTime(PREFETCH_WORKBENCH_DELAY_MS - 1))
    act(() => result.current.cancel())
    act(() => vi.advanceTimersByTime(PREFETCH_WORKBENCH_DELAY_MS))
    expect(mocks.get).not.toHaveBeenCalled()

    // Passar rápido por uma tarefa e parar na seguinte: só a última é buscada.
    act(() => result.current.schedule('t1'))
    act(() => result.current.schedule('t2'))
    await act(async () => vi.advanceTimersByTime(PREFETCH_WORKBENCH_DELAY_MS))
    expect(mocks.get.mock.calls.map(([path]) => path)).toEqual(['/agentic/workbenches/by-task/t2'])
  })

  it('mesa fresca no cache não é buscada de novo; desmontar cancela a pendente', async () => {
    vi.useFakeTimers()
    const { client, wrapper } = setup()
    client.setQueryData(agenticKey('workbench', 't1'), { id: 'w1', taskId: 't1' })
    const { result, unmount } = renderHook(() => usePrefetchWorkbench(), { wrapper })
    await act(async () => result.current.prefetch('t1'))
    expect(mocks.get).not.toHaveBeenCalled()
    act(() => result.current.schedule('t3'))
    unmount()
    await act(async () => vi.advanceTimersByTime(PREFETCH_WORKBENCH_DELAY_MS * 2))
    expect(mocks.get).not.toHaveBeenCalled()
  })
})

describe('exclusões esquecem a saída guardada', () => {
  it('excluir a mesa apaga a saída dela (e dos forks)', async () => {
    writeTimelineCache('/api/agentic/workbenches/w1/events', loaded)
    writeTimelineCache('/api/agentic/workbenches/w2/events', loaded)
    const { wrapper } = setup()
    const { result } = renderHook(() => useDeleteWorkbench(), { wrapper })
    await act(async () => result.current.mutateAsync({ id: 'w1', taskId: 't1', centralId: 'c1' } as unknown as WorkbenchDto))
    expect(readTimelineCache('/api/agentic/workbenches/w1/events')).toBeNull()
    expect(readTimelineCache('/api/agentic/workbenches/w2/events')).not.toBeNull()
  })

  it('descartar o fork apaga a saída do fork', async () => {
    writeTimelineCache('/api/agentic/workbenches/w1/forks/f1/events', loaded)
    writeTimelineCache('/api/agentic/workbenches/w1/events', loaded)
    const { wrapper } = setup()
    const { result } = renderHook(() => useDiscardFork('w1'), { wrapper })
    await act(async () => result.current.mutateAsync({ id: 'f1', number: 1 } as unknown as ForkDto))
    expect(readTimelineCache('/api/agentic/workbenches/w1/forks/f1/events')).toBeNull()
    expect(readTimelineCache('/api/agentic/workbenches/w1/events')).not.toBeNull()
  })
})
