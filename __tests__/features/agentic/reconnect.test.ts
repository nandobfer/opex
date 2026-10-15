import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_RECONNECT_DELAYS_MS, createReconnectCycle, reconnectDecision, type ReconnectCycleResult, type ReconnectCycleState, type ReconnectOutcome } from '@/features/agentic/reconnect'

describe('reconnectDecision', () => {
  it('classifica anexado/recuperado como sucesso, nada como definitivo e o resto como transitório', () => {
    expect(reconnectDecision('attached')).toBe('success')
    expect(reconnectDecision('recovered')).toBe('success')
    expect(reconnectDecision('nothing')).toBe('nothing')
    expect(reconnectDecision('transient')).toBe('retry')
    expect(reconnectDecision(null)).toBe('retry')
    expect(reconnectDecision(undefined)).toBe('retry')
  })
})

function observer(attempt: () => Promise<ReconnectOutcome | null>) {
  const updates: ReconnectCycleState[] = []
  const results: ReconnectCycleResult[] = []
  const cycle = createReconnectCycle({ attempt, onUpdate: (state) => updates.push(state), onResult: (result) => results.push(result) })
  return { cycle, updates, results }
}

describe('createReconnectCycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('tenta na agenda 1s → 2s → 4s → 8s → 16s e esgota após 5 tentativas', async () => {
    const attempt = vi.fn(async (): Promise<ReconnectOutcome | null> => 'transient')
    const { cycle, updates, results } = observer(attempt)
    cycle.start()
    expect(updates.at(0)).toEqual({ reconnecting: true, exhausted: false })
    for (let index = 0; index < AUTO_RECONNECT_DELAYS_MS.length; index++) {
      expect(attempt).toHaveBeenCalledTimes(index)
      await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[index]!)
      expect(attempt).toHaveBeenCalledTimes(index + 1)
    }
    expect(results).toEqual(['exhausted'])
    expect(updates.at(-1)).toEqual({ reconnecting: false, exhausted: true })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(attempt).toHaveBeenCalledTimes(5)
  })

  it('para no sucesso (attached) sem novas tentativas', async () => {
    const attempt = vi.fn(async (): Promise<ReconnectOutcome | null> => 'attached')
    const { cycle, updates, results } = observer(attempt)
    cycle.start()
    await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[0])
    expect(results).toEqual(['attached'])
    expect(updates.at(-1)).toEqual({ reconnecting: false, exhausted: false })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('resposta definitiva (nada para acompanhar) encerra na hora, sem esgotar', async () => {
    const attempt = vi.fn(async (): Promise<ReconnectOutcome | null> => 'nothing')
    const { cycle, results } = observer(attempt)
    cycle.start()
    await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[0])
    expect(results).toEqual(['nothing'])
    await vi.advanceTimersByTimeAsync(120_000)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('erro na tentativa conta como falha transitória (continua a agenda)', async () => {
    const attempt = vi.fn(async (): Promise<ReconnectOutcome | null> => {
      throw new Error('rede')
    })
    const { cycle, results } = observer(attempt)
    cycle.start()
    await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[0])
    await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[1])
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(results).toEqual([])
  })

  it('clique manual tenta na hora e reinicia a agenda do 1s', async () => {
    const attempt = vi.fn(async (): Promise<ReconnectOutcome | null> => 'transient')
    const { cycle } = observer(attempt)
    cycle.start()
    await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[0])
    expect(attempt).toHaveBeenCalledTimes(1)
    cycle.retryNow()
    expect(attempt).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(0)
    // A tentativa manual não consome a agenda: a próxima volta a ser 1s.
    await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[0])
    expect(attempt).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[1])
    expect(attempt).toHaveBeenCalledTimes(4)
  })

  it('stop cancela a agenda e ignora o resultado de uma tentativa em voo', async () => {
    let resolveAttempt: (outcome: ReconnectOutcome | null) => void = () => {}
    const attempt = vi.fn((): Promise<ReconnectOutcome | null> => new Promise((resolve) => (resolveAttempt = resolve)))
    const { cycle, results } = observer(attempt)
    cycle.start()
    await vi.advanceTimersByTimeAsync(AUTO_RECONNECT_DELAYS_MS[0])
    expect(attempt).toHaveBeenCalledTimes(1)
    cycle.stop()
    resolveAttempt('attached')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(results).toEqual([])
    expect(attempt).toHaveBeenCalledTimes(1)
  })
})
