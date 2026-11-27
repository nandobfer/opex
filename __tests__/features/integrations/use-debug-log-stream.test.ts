/** @vitest-environment happy-dom */

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntegrationLogLine } from "@nandobfer/integracoes"

/**
 * Logs de debug compartilhados por integrações e plugins (`useDebugLogStream`): carga inicial, linha
 * repetida descartada, "Atualizar" pelo `after`, filtro `accept` no tempo real e o canal liberado ao
 * desmontar.
 */

const pusher = vi.hoisted(() => ({
  handlers: new Map<string, (payload: { entries?: unknown[] }) => void>(),
  acquire: vi.fn(),
  release: vi.fn(),
  unbind: vi.fn(),
}))

vi.mock("@/lib/pusher/client", () => ({
  acquireChannel: (channel: string) => {
    pusher.acquire(channel)
    return {
      bind: (event: string, handler: (payload: { entries?: unknown[] }) => void) => void pusher.handlers.set(event, handler),
      unbind: (event: string, handler: unknown) => {
        pusher.unbind(event, handler)
        pusher.handlers.delete(event)
      },
    }
  },
  releaseChannel: pusher.release,
}))

import { useDebugLogStream, type DebugLogStreamSource } from "@nandobfer/integracoes/react"

const line = (ts: string, message: string, level = 'info'): IntegrationLogLine => ({ ts, level, message }) as IntegrationLogLine

function setup(overrides: Partial<DebugLogStreamSource> = {}, enabled = true) {
  const fetch = vi.fn<DebugLogStreamSource['fetch']>()
  const onLines = vi.fn()
  const source: DebugLogStreamSource = { fetch, realtime: { channel: 'private-plugin-relogio', event: 'plugin-debug' }, key: 'relogio', ...overrides }
  const hook = renderHook(({ on }) => useDebugLogStream(source, { enabled: on, onLines }), { initialProps: { on: enabled } })
  return { fetch, onLines, hook }
}

beforeEach(() => {
  pusher.handlers.clear()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('useDebugLogStream', () => {
  it('carga inicial com reset, linha repetida descartada e "Atualizar" pelo after da última linha', async () => {
    const { fetch, onLines, hook } = setup()
    fetch.mockResolvedValueOnce([line('2026-11-19T10:00:00.000Z', 'a'), line('2026-11-19T10:01:00.000Z', 'b')])
    await waitFor(() => expect(onLines).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenCalledWith({ limit: 500 })
    expect(onLines).toHaveBeenLastCalledWith([expect.objectContaining({ message: 'a' }), expect.objectContaining({ message: 'b' })], true)
    expect(hook.result.current.mode).toBe('realtime')

    fetch.mockResolvedValueOnce([line('2026-11-19T10:01:00.000Z', 'b'), line('2026-11-19T10:02:00.000Z', 'c')])
    await act(() => hook.result.current.refresh())
    expect(fetch).toHaveBeenLastCalledWith({ after: '2026-11-19T10:01:00.000Z', limit: 1000 })
    expect(onLines).toHaveBeenLastCalledWith([expect.objectContaining({ message: 'c' })], false)

    // Só repetidas: nada a acrescentar.
    fetch.mockResolvedValueOnce([line('2026-11-19T10:02:00.000Z', 'c')])
    await act(() => hook.result.current.refresh())
    expect(onLines).toHaveBeenCalledTimes(2)
  })

  it('tempo real: aplica o accept, descarta repetidas e libera o canal ao desmontar', async () => {
    const { fetch, onLines, hook } = setup({ accept: (entry) => entry.level !== 'debug' })
    fetch.mockResolvedValueOnce([line('2026-11-19T10:00:00.000Z', 'a')])
    await waitFor(() => expect(onLines).toHaveBeenCalledTimes(1))
    expect(pusher.acquire).toHaveBeenCalledWith('private-plugin-relogio')

    act(() => pusher.handlers.get('plugin-debug')!({ entries: [line('2026-11-19T10:00:00.000Z', 'a'), line('2026-11-19T10:03:00.000Z', 'ruído', 'debug'), line('2026-11-19T10:04:00.000Z', 'nova')] }))
    expect(onLines).toHaveBeenLastCalledWith([expect.objectContaining({ message: 'nova' })], false)

    hook.unmount()
    expect(pusher.unbind).toHaveBeenCalledWith('plugin-debug', expect.any(Function))
    expect(pusher.release).toHaveBeenCalledWith('private-plugin-relogio')
  })

  it('sem tempo real é manual e não assina canal; desligado não carrega; erro de carga vira mensagem', async () => {
    const off = setup({ realtime: null }, false)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(off.fetch).not.toHaveBeenCalled()
    expect(off.hook.result.current.mode).toBe('manual')
    off.hook.unmount()

    const { fetch, hook } = setup({ realtime: null })
    fetch.mockRejectedValueOnce(new Error('rede'))
    await waitFor(() => expect(hook.result.current.error).toBe('Não foi possível carregar os logs'))
    expect(pusher.acquire).not.toHaveBeenCalled()
  })
})
