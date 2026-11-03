import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cota/limite do provedor no turno do OpenCode (OPE-127): a cota esgotada da Anthropic chega como 429
 * `provider.rate-limit`, que o OpenCode repete respeitando o `retry-after` (às vezes horas). Com a
 * política (`providerLimit`, mesa e fork), o turno desiste das novas tentativas, interrompe a execução
 * e termina como falha do modelo (`limited`) — elegível ao fallback. Sem a política, nada muda.
 */

vi.mock('@/lib/ai/consumption', () => ({ recordAiConsumption: vi.fn(async () => {}) }))
vi.mock('@/features/agentic/server/hub', () => ({ publishWorkbenchEvent: vi.fn() }))

import { runAgentTurn, type TurnEvent } from '@/lib/ai/opencode-run'
import { DEFAULT_PROVIDER_LIMIT_POLICY } from '@/lib/ai/opencode-events'
import type { OpencodeClient } from '@/lib/ai/opencode-client'
import { runAgentTurn as runWorkbenchTurn } from '@/features/agentic/server/runner'

const ev = (type: string, data: Record<string, unknown> = {}) => ({ type, data: { sessionID: 's1', ...data } })
const HOURS = 60 * 60_000
const LIMIT_ERROR = { type: 'provider.rate-limit', message: 'This request would exceed your account rate limit', status: 429 }

/** Cliente falso: depois do prompt, emite `script`; ao interromper, emite `execution.interrupted`. */
function scriptedClient(script: () => unknown[]) {
  const queue: unknown[] = []
  let wake: () => void = () => {}
  const push = (...items: unknown[]) => {
    queue.push(...items)
    wake()
  }
  const interrupt = vi.fn(async () => push(ev('session.execution.interrupted', { reason: 'user' })))
  const client = {
    session: {
      switchAgent: vi.fn().mockResolvedValue(undefined),
      switchModel: vi.fn().mockResolvedValue(undefined),
      prompt: vi.fn(async () => push(...script())),
      interrupt,
      get: vi.fn().mockResolvedValue(null),
    },
    event: {
      subscribe: (opts: { onActivity?: () => void; signal: AbortSignal }) =>
        (async function* () {
          opts.onActivity?.()
          yield { type: 'server.connected', data: {} }
          while (!opts.signal.aborted) {
            if (!queue.length) await new Promise<void>((resolve) => (wake = resolve))
            while (queue.length) yield queue.shift()
          }
        })(),
    },
  } as unknown as OpencodeClient
  return { client, interrupt }
}

const base = { id: 'w1', sessionId: 's1', stage: 'Planejando', title: 'Planejando', agent: { agent: 'plan', model: 'anthropic/claude-opus', variant: null }, text: 'Planeje', timeoutMs: 60_000, signal: new AbortController().signal }

beforeEach(() => vi.clearAllMocks())

describe('limite do provedor no turno do OpenCode', () => {
  it('cota da Anthropic com nova tentativa em horas: interrompe e termina como falha do modelo (limited)', async () => {
    const { client, interrupt } = scriptedClient(() => [ev('session.retry.scheduled', { attempt: 1, at: Date.now() + 3 * HOURS, error: LIMIT_ERROR })])
    const events: TurnEvent[] = []
    const result = await runAgentTurn(client, { ...base, providerLimit: DEFAULT_PROVIDER_LIMIT_POLICY }, { publish: (event) => events.push(event) })
    expect(interrupt).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ outcome: 'failed', failure: 'model', limited: true })
    expect(result.message).toContain('Limite de uso do provedor em anthropic/claude-opus (provider.rate-limit: This request would exceed your account rate limit)')
    expect(result.message).toContain('o OpenCode só tentaria de novo em')
    expect(events.some((event) => event.type === 'notice' && event.message.startsWith('Nova tentativa (1)'))).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'turn-end', outcome: 'failed' })
  })

  it('3ª tentativa por limite, mesmo com espera curta: desiste', async () => {
    const { client, interrupt } = scriptedClient(() => [ev('session.retry.scheduled', { attempt: 3, at: Date.now() + 5_000, error: LIMIT_ERROR })])
    const result = await runAgentTurn(client, { ...base, providerLimit: DEFAULT_PROVIDER_LIMIT_POLICY })
    expect(interrupt).toHaveBeenCalledTimes(1)
    expect(result.limited).toBe(true)
  })

  it('limite passageiro (poucos segundos, 1ª tentativa): o OpenCode segue tentando e o turno conclui', async () => {
    const { client, interrupt } = scriptedClient(() => [ev('session.retry.scheduled', { attempt: 1, at: Date.now() + 5_000, error: LIMIT_ERROR }), ev('session.text.delta', { delta: '# Plano' }), ev('session.execution.succeeded')])
    const result = await runAgentTurn(client, { ...base, providerLimit: DEFAULT_PROVIDER_LIMIT_POLICY })
    expect(interrupt).not.toHaveBeenCalled()
    expect(result).toMatchObject({ outcome: 'succeeded', text: '# Plano' })
    expect(result.limited).toBeUndefined()
  })

  it('erro que não é de cota (sobrecarga) com espera longa: não desiste nem marca limite', async () => {
    const overload = { type: 'provider.internal', message: 'overloaded_error', status: 529 }
    const { client, interrupt } = scriptedClient(() => [ev('session.retry.scheduled', { attempt: 4, at: Date.now() + 3 * HOURS, error: overload }), ev('session.execution.succeeded')])
    const result = await runAgentTurn(client, { ...base, providerLimit: DEFAULT_PROVIDER_LIMIT_POLICY })
    expect(interrupt).not.toHaveBeenCalled()
    expect(result.outcome).toBe('succeeded')
  })

  it('sem a política (outros agentes): o mesmo limite não interrompe', async () => {
    const { client, interrupt } = scriptedClient(() => [ev('session.retry.scheduled', { attempt: 1, at: Date.now() + 3 * HOURS, error: LIMIT_ERROR }), ev('session.execution.succeeded')])
    const result = await runAgentTurn(client, base)
    expect(interrupt).not.toHaveBeenCalled()
    expect(result.outcome).toBe('succeeded')
  })

  it('mesa de trabalho: o turno da etapa já leva a política e desiste da cota esgotada', async () => {
    const { client, interrupt } = scriptedClient(() => [ev('session.retry.scheduled', { attempt: 1, at: Date.now() + 3 * HOURS, error: LIMIT_ERROR })])
    const result = await runWorkbenchTurn(client, { workbenchId: 'w1', sessionId: 's1', stage: 'planning', title: 'Planejando', agent: base.agent, text: 'Planeje', timeoutMs: 60_000, signal: base.signal })
    expect(interrupt).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ outcome: 'failed', failure: 'model', limited: true })
  })

  it('cota que encerra a execução (execution.failed): também conta como limite', async () => {
    const { client, interrupt } = scriptedClient(() => [ev('session.execution.failed', { error: { type: 'provider.quota', message: 'Your credit balance is too low', status: 400 } })])
    const result = await runAgentTurn(client, { ...base, providerLimit: DEFAULT_PROVIDER_LIMIT_POLICY })
    expect(interrupt).not.toHaveBeenCalled()
    expect(result).toMatchObject({ outcome: 'failed', failure: 'model', limited: true, message: 'Your credit balance is too low' })
  })

  it('falha de modelo que não é de cota não é marcada como limite', async () => {
    const { client } = scriptedClient(() => [ev('session.execution.failed', { error: { type: 'provider.invalid-request', message: 'modelo indisponível', status: 404 } })])
    const result = await runAgentTurn(client, { ...base, providerLimit: DEFAULT_PROVIDER_LIMIT_POLICY })
    expect(result).toMatchObject({ outcome: 'failed', failure: 'model', message: 'modelo indisponível' })
    expect(result.limited).toBeUndefined()
  })

  it('Parar do usuário durante a desistência: o turno termina interrompido, não como falha de limite', async () => {
    const controller = new AbortController()
    const { client } = scriptedClient(() => [ev('session.retry.scheduled', { attempt: 1, at: Date.now() + 3 * HOURS, error: LIMIT_ERROR })])
    const result = await runAgentTurn(client, { ...base, signal: controller.signal, providerLimit: DEFAULT_PROVIDER_LIMIT_POLICY }, {
      publish: (event) => {
        // O Parar chega na janela entre a desistência e o fim da execução no OpenCode.
        if (event.type === 'notice' && event.message.includes('Desistindo das novas tentativas')) controller.abort(new Error('Parado pelo usuário'))
      },
    })
    expect(result).toMatchObject({ outcome: 'interrupted', message: 'Parado pelo usuário' })
    expect(result.limited).toBeUndefined()
  })
})
