import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ publish: vi.fn() }))
vi.mock('@/features/agentic/server/hub', () => ({ publishWorkbenchEvent: mocks.publish }))

import { runAgentTurn } from '@/features/agentic/server/runner'
import type { OpencodeClient } from '@/lib/ai/opencode-client'

type Raw = { type: string; data: Record<string, unknown> }

/** Cliente falso: o SSE entrega os eventos depois do prompt. */
function fakeClient(events: Raw[], options: { promptError?: Error } = {}) {
  let release: () => void = () => {}
  const prompted = new Promise<void>((resolve) => {
    release = resolve
  })
  let stop: () => void = () => {}
  const interrupted = new Promise<'interrupted'>((resolve) => {
    stop = () => resolve('interrupted')
  })
  const client = {
    session: {
      switchAgent: vi.fn().mockResolvedValue(undefined),
      switchModel: vi.fn().mockResolvedValue(undefined),
      prompt: vi.fn(async () => {
        if (options.promptError) throw options.promptError
        release()
      }),
      interrupt: vi.fn(async () => {
        stop()
        return {}
      }),
      get: vi.fn().mockResolvedValue(null),
    },
    event: {
      subscribe: (opts: { onActivity?: () => void; signal?: AbortSignal }) =>
        (async function* () {
          opts.onActivity?.()
          yield { type: 'server.connected', data: {} }
          await prompted
          for (const event of events) yield event
          const reason = await Promise.race([interrupted, new Promise((resolve) => opts.signal?.addEventListener('abort', () => resolve('aborted')))])
          if (reason === 'interrupted') yield { type: 'session.execution.interrupted', data: { sessionID: 's1', reason: 'user' } }
        })(),
    },
  }
  return client as unknown as OpencodeClient & { session: typeof client.session }
}

const ev = (type: string, data: Record<string, unknown> = {}): Raw => ({ type, data: { sessionID: 's1', ...data } })
const request = (signal = new AbortController().signal) => ({ workbenchId: 'w1', sessionId: 's1', stage: 'planning' as const, title: 'Planejando', agent: { agent: 'plan', model: 'anthropic/opus', variant: 'high' }, text: 'Planeje', timeoutMs: 60_000, signal })

beforeEach(() => vi.clearAllMocks())

describe('runAgentTurn', () => {
  it('troca agente e modelo, envia a mensagem e devolve o texto do turno', async () => {
    const client = fakeClient([ev('session.text.delta', { delta: '# Plano' }), ev('session.step.ended', { cost: 0.2, tokens: { input: 1, output: 2, reasoning: 0 } }), ev('session.execution.succeeded')])
    const onStep = vi.fn()
    const result = await runAgentTurn(client, request(), { onStep })
    expect(client.session.switchAgent).toHaveBeenCalledWith({ sessionID: 's1', agent: 'plan' })
    expect(client.session.switchModel).toHaveBeenCalledWith({ sessionID: 's1', model: { providerID: 'anthropic', id: 'opus', variant: 'high' } })
    expect(client.session.prompt).toHaveBeenCalledWith({ sessionID: 's1', text: 'Planeje' })
    expect(result).toMatchObject({ outcome: 'succeeded', text: '# Plano', costUsd: 0.2 })
    expect(onStep).toHaveBeenCalled()
    const types = mocks.publish.mock.calls.map(([, payload]) => (payload as { type: string }).type)
    expect(types[0]).toBe('turn')
    expect(types.at(-1)).toBe('turn-end')
  })

  it('ignora eventos de outras sessões e repassa pedidos de permissão', async () => {
    const onPermission = vi.fn()
    const client = fakeClient([{ type: 'session.text.delta', data: { sessionID: 'outra', delta: 'x' } }, ev('permission.asked', { id: 'p1', action: 'bash', resources: [] }), ev('session.execution.succeeded')])
    const result = await runAgentTurn(client, request(), { onPermission })
    expect(result.text).toBe('')
    expect(onPermission).toHaveBeenCalledWith({ id: 'p1', action: 'bash', resources: [], message: null })
  })

  it('falha da execução vira resultado failed com a mensagem', async () => {
    const client = fakeClient([ev('session.execution.failed', { error: { message: 'cota excedida' } })])
    expect(await runAgentTurn(client, request())).toMatchObject({ outcome: 'failed', message: 'cota excedida' })
  })

  it('mensagem recusada pelo OpenCode falha o turno', async () => {
    const client = fakeClient([], { promptError: new Error('sessão ocupada') })
    expect(await runAgentTurn(client, request())).toMatchObject({ outcome: 'failed', message: expect.stringContaining('sessão ocupada') })
  })

  it('abortar interrompe a sessão', async () => {
    const controller = new AbortController()
    const client = fakeClient([ev('session.text.delta', { delta: 'a' })])
    const pending = runAgentTurn(client, request(controller.signal))
    await vi.waitFor(() => expect(client.session.prompt).toHaveBeenCalled())
    controller.abort(new Error('Interrompido pelo usuário'))
    const result = await pending
    expect(client.session.interrupt).toHaveBeenCalledWith({ sessionID: 's1' })
    expect(result).toMatchObject({ outcome: 'interrupted', text: 'a' })
  })
})
