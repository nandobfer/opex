/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLiveDiagram } from '@/features/architect-agent/hooks/useLiveDiagram'
import type { ArchitectStreamLine } from '@/features/architect-agent/types'
import { sampleGraph } from './fixtures'

/**
 * "Tentar novamente" com o mesmo id: o primeiro stream chega antes de o servidor reiniciar a versão e
 * recebe `end(failed)`; enquanto a tela ainda a considera "gerando", o hook reconecta e recebe o
 * desenho ao vivo. Quando a lista confirma o fim, a tela tira o id e o hook para.
 */

const ndjson = (lines: ArchitectStreamLine[], open = false) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) controller.enqueue(new TextEncoder().encode(`${JSON.stringify(line)}\n`))
        if (!open) controller.close()
      },
    }),
    { status: 200 },
  )

const progress = { phase: 'writing' as const, tools: 1, nodes: 0, edges: 0 }
const failedDraft = { ...sampleGraph(), nodes: sampleGraph().nodes.slice(0, 1), edges: [] }

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>

beforeEach(() => {
  client = new QueryClient()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useLiveDiagram', () => {
  it('versão reiniciada com o mesmo id: o fim da tentativa antiga não encerra; reconecta e desenha ao vivo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ndjson([{ type: 'snapshot', seq: 0, graph: failedDraft, progress }, { type: 'end', state: 'failed' }]))
      .mockResolvedValueOnce(ndjson([{ type: 'snapshot', seq: 3, graph: sampleGraph(), progress: { ...progress, nodes: 6, edges: 5 } }], true))
    vi.stubGlobal('fetch', fetchMock)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useLiveDiagram('w1', 'd1'), { wrapper })
    await waitFor(() => expect(result.current.ended).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: expect.arrayContaining(['w1']) })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.graph?.nodes).toHaveLength(6))
    expect(result.current.ended).toBe(false)
    expect(result.current.seq).toBe(3)
  })

  it('quando a lista confirma o fim, a tela tira o id e o hook não conecta mais', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ndjson([{ type: 'snapshot', seq: 1, graph: sampleGraph(), progress }, { type: 'end', state: 'done' }]))
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useLiveDiagram('w1', id), { wrapper, initialProps: { id: 'd1' as string | null } })
    await waitFor(() => expect(result.current.ended).toBe(true))
    rerender({ id: null })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
