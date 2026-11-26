/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useEventStream } from '@/features/agentic/hooks/useEventStream'
import { clearTimelineCache, readTimelineCache } from '@/features/agentic/timeline-cache'
import type { WorkbenchStreamLine } from '@/features/agentic/types'

/**
 * OPE-188: a saída já vista aparece na hora ao voltar à mesa (sem "Carregando a saída…"); a releitura
 * acontece por trás e troca no `ready`; a reconexão não pisca o vazio. `fetch` mockado (sem rede).
 */

const ts = '2026-11-26T12:00:00.000Z'
const notice = (message: string, seq: number): WorkbenchStreamLine => ({ type: 'notice', level: 'info', message, seq, ts })
const URL_A = '/api/agentic/workbenches/w1/events'

interface Stream {
  push: (...lines: WorkbenchStreamLine[]) => void
  close: () => void
}

let streams: Stream[] = []

function mockFetch() {
  const fetchMock = vi.fn(async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({ start: (value) => void (controller = value) })
    const encoder = new TextEncoder()
    streams.push({
      push: (...lines) => controller.enqueue(encoder.encode(lines.map((line) => `${JSON.stringify(line)}\n`).join(''))),
      close: () => controller.close(),
    })
    return new Response(body, { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const messages = (timeline: { items: { kind: string }[] }) => timeline.items.map((item) => (item as { message?: string }).message)

beforeEach(() => {
  streams = []
  clearTimelineCache()
  mockFetch()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useEventStream', () => {
  it('primeira visita: carrega de forma progressiva a partir do reset', async () => {
    const { result } = renderHook(() => useEventStream('w1', URL_A))
    expect(result.current.timeline.loaded).toBe(false)
    await waitFor(() => expect(streams).toHaveLength(1))
    act(() => streams[0]!.push({ type: 'reset' }, notice('a', 1)))
    await waitFor(() => expect(messages(result.current.timeline)).toEqual(['a']))
    expect(result.current.timeline.loaded).toBe(true)
  })

  it('regressão: voltar à mesa mostra a saída guardada na hora e troca só no ready', async () => {
    const first = renderHook(() => useEventStream('w1', URL_A))
    await waitFor(() => expect(streams).toHaveLength(1))
    act(() => streams[0]!.push({ type: 'reset' }, notice('a', 1), { type: 'ready' }))
    await waitFor(() => expect(messages(first.result.current.timeline)).toEqual(['a']))
    first.unmount()
    expect(readTimelineCache(URL_A)).not.toBeNull()

    // Remonta (troca de mesa e volta): nada de "Carregando a saída…".
    const second = renderHook(() => useEventStream('w1', URL_A))
    expect(second.result.current.timeline.loaded).toBe(true)
    expect(messages(second.result.current.timeline)).toEqual(['a'])
    await waitFor(() => expect(streams).toHaveLength(2))
    act(() => streams[1]!.push({ type: 'reset' }, notice('a', 1)))
    await new Promise((resolve) => setTimeout(resolve, 40))
    // A releitura ainda não terminou: a tela continua com a saída guardada (não apaga).
    expect(messages(second.result.current.timeline)).toEqual(['a'])
    act(() => streams[1]!.push(notice('b', 2), { type: 'ready' }))
    await waitFor(() => expect(messages(second.result.current.timeline)).toEqual(['a', 'b']))
  })

  it('reconexão não pisca o vazio: a saída fica até o novo ready', async () => {
    const { result } = renderHook(() => useEventStream('w1', URL_A))
    await waitFor(() => expect(streams).toHaveLength(1))
    act(() => streams[0]!.push({ type: 'reset' }, notice('a', 1), { type: 'ready' }))
    await waitFor(() => expect(messages(result.current.timeline)).toEqual(['a']))
    act(() => streams[0]!.close())
    // Reconecta depois de 3 s.
    await waitFor(() => expect(streams).toHaveLength(2), { timeout: 5000 })
    act(() => streams[1]!.push({ type: 'reset' }))
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(messages(result.current.timeline)).toEqual(['a'])
    expect(result.current.timeline.items).toHaveLength(1)
    act(() => streams[1]!.push(notice('a', 1), notice('c', 2), { type: 'ready' }))
    await waitFor(() => expect(messages(result.current.timeline)).toEqual(['a', 'c']))
  }, 10_000)

  it('trocar de mesa no mesmo componente mostra a saída da outra (guardada ou carregando)', async () => {
    const { result, rerender } = renderHook(({ id }) => useEventStream(id, `/api/agentic/workbenches/${id}/events`), { initialProps: { id: 'w1' } })
    await waitFor(() => expect(streams).toHaveLength(1))
    act(() => streams[0]!.push({ type: 'reset' }, notice('a', 1), { type: 'ready' }))
    await waitFor(() => expect(messages(result.current.timeline)).toEqual(['a']))
    rerender({ id: 'w2' })
    expect(result.current.timeline.loaded).toBe(false)
    rerender({ id: 'w1' })
    expect(messages(result.current.timeline)).toEqual(['a'])
  })
})
