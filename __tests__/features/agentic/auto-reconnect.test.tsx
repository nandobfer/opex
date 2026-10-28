/** @vitest-environment happy-dom */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_RECONNECT_DELAYS_MS, type ReconnectOutcome } from '@/features/agentic/reconnect'
import { AUTO_RECONNECT_EXHAUSTED_NOTICE, AUTO_RECONNECT_NOTHING_NOTICE, useAutoReconnect } from '@/features/agentic/hooks/useAutoReconnect'

interface Props {
  eligible: boolean
  episodeKey: string
}

const setup = (attempt: () => Promise<ReconnectOutcome | null>, initial: Props = { eligible: true, episodeKey: 'e1' }) =>
  renderHook((props: Props) => useAutoReconnect({ eligible: props.eligible, episodeKey: props.episodeKey, attempt }), { initialProps: initial })

describe('useAutoReconnect', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('inicia o ciclo ao abrir elegível e para no sucesso', async () => {
    const attempt = vi.fn(async (): Promise<ReconnectOutcome | null> => 'attached')
    const { result } = setup(attempt)
    expect(result.current.reconnecting).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[0])
    })
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(result.current.reconnecting).toBe(false)
    expect(result.current.notice).toBeNull()
  })

  it('não reinicia a contagem por uma oscilação do mesmo episódio', async () => {
    const attempt = vi.fn(async (): Promise<ReconnectOutcome | null> => 'transient')
    const { result, rerender } = setup(attempt)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[0])
    })
    expect(attempt).toHaveBeenCalledTimes(1)
    act(() => rerender({ eligible: false, episodeKey: 'e1' }))
    act(() => rerender({ eligible: true, episodeKey: 'e1' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(result.current.reconnecting).toBe(false)
  })

  it('um episódio novo libera um novo ciclo', async () => {
    const attempt = vi.fn(async (): Promise<ReconnectOutcome | null> => 'transient')
    const { rerender } = setup(attempt)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[0])
    })
    act(() => rerender({ eligible: false, episodeKey: 'e1' }))
    act(() => rerender({ eligible: true, episodeKey: 'e2' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[0])
    })
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('esgota as tentativas com o aviso discreto e o clique manual volta a tentar', async () => {
    const attempt = vi.fn(async (): Promise<ReconnectOutcome | null> => 'transient')
    const { result } = setup(attempt)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000 + 2_000 + 4_000 + 8_000 + 16_000)
    })
    expect(attempt).toHaveBeenCalledTimes(5)
    expect(result.current.notice).toBe(AUTO_RECONNECT_EXHAUSTED_NOTICE)
    expect(result.current.reconnecting).toBe(false)
    act(() => result.current.retryNow())
    expect(result.current.notice).toBeNull()
    expect(attempt).toHaveBeenCalledTimes(6)
  })

  it('resposta definitiva encerra o ciclo e mantém o aviso', async () => {
    const attempt = vi.fn(async (): Promise<ReconnectOutcome | null> => 'nothing')
    const { result } = setup(attempt)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[0])
    })
    expect(result.current.notice).toBe(AUTO_RECONNECT_NOTHING_NOTICE)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('não tenta nada quando não está elegível', async () => {
    const attempt = vi.fn(async (): Promise<ReconnectOutcome | null> => 'attached')
    const { result } = setup(attempt, { eligible: false, episodeKey: 'e1' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(attempt).not.toHaveBeenCalled()
    expect(result.current.reconnecting).toBe(false)
  })
})
