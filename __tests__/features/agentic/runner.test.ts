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
    expect(await runAgentTurn(client, request())).toMatchObject({ outcome: 'failed', message: 'cota excedida', failure: 'model' })
  })

  it('mensagem recusada pelo OpenCode falha o turno', async () => {
    const client = fakeClient([], { promptError: new Error('sessão ocupada') })
    expect(await runAgentTurn(client, request())).toMatchObject({ outcome: 'failed', message: expect.stringContaining('sessão ocupada'), failure: 'model' })
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

/** Cliente falso para a reconexão: estado remoto (`get`/`active`) + histórico de mensagens. */
function attachClient(options: { active?: boolean; idle?: number; outcome?: 'succeeded' | 'failed' | 'interrupted'; messages?: unknown[]; events?: Raw[]; forms?: unknown[]; permissions?: unknown[] } = {}) {
  const client = {
    session: {
      switchAgent: vi.fn().mockResolvedValue(undefined),
      switchModel: vi.fn().mockResolvedValue(undefined),
      prompt: vi.fn().mockResolvedValue(undefined),
      interrupt: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({ time: { created: 0, updated: 0, idle: options.idle ?? 0 }, outcome: options.outcome, location: { directory: '/repo' } }),
      active: vi.fn().mockResolvedValue(options.active ? { s1: { type: 'running' } } : {}),
      form: { list: vi.fn().mockResolvedValue(options.forms ?? []) },
    },
    message: { list: vi.fn().mockResolvedValue({ data: options.messages ?? [], cursor: {} }) },
    permission: { list: vi.fn().mockResolvedValue(options.permissions ?? []) },
    event: {
      subscribe: (opts: { onActivity?: () => void }) =>
        (async function* () {
          opts.onActivity?.()
          yield { type: 'server.connected', data: {} }
          for (const event of options.events ?? []) yield event
        })(),
    },
  }
  return client as unknown as OpencodeClient & typeof client
}

describe('runAgentTurn (reconexão)', () => {
  it('acompanha a sessão em andamento sem reenviar prompt nem trocar agente/modelo', async () => {
    const client = attachClient({ active: true, events: [ev('session.text.delta', { delta: 'concluindo…' }), ev('session.execution.succeeded')] })
    const result = await runAgentTurn(client, { ...request(), text: '', attach: true, startedAt: 1000 })
    expect(client.session.prompt).not.toHaveBeenCalled()
    expect(client.session.switchAgent).not.toHaveBeenCalled()
    expect(client.session.switchModel).not.toHaveBeenCalled()
    expect(result.outcome).toBe('succeeded')
    const types = mocks.publish.mock.calls.map(([, payload]) => (payload as { type: string }).type)
    expect(types).not.toContain('turn')
    expect(types.at(-1)).toBe('turn-end')
  })

  it('recupera o resultado de uma execução que terminou durante a queda', async () => {
    const client = attachClient({
      active: false,
      idle: 5000,
      outcome: 'succeeded',
      messages: [{ type: 'assistant', id: 'm1', time: { created: 5000 }, content: [{ type: 'text', text: '# Plano recuperado' }] }],
    })
    const result = await runAgentTurn(client, { ...request(), text: '', attach: true, startedAt: 1000 })
    expect(result).toMatchObject({ outcome: 'succeeded', text: '# Plano recuperado' })
    expect(client.session.prompt).not.toHaveBeenCalled()
  })

  it('sem execução em andamento nem resultado recente, não cria sessão nem reenvia o prompt', async () => {
    const client = attachClient({ active: false, idle: 100, outcome: 'succeeded' })
    const result = await runAgentTurn(client, { ...request(), text: '', attach: true, startedAt: 1000 })
    expect(result).toMatchObject({ outcome: 'interrupted', message: expect.stringContaining('Não há execução em andamento') })
    expect(client.session.prompt).not.toHaveBeenCalled()
  })

  it('sessão inexistente falha com mensagem clara', async () => {
    const client = attachClient({})
    client.session.get.mockResolvedValue(null)
    const result = await runAgentTurn(client, { ...request(), text: '', attach: true, startedAt: 1000 })
    expect(result).toMatchObject({ outcome: 'failed', message: expect.stringContaining('não existe mais'), failure: 'other' })
    expect(client.session.prompt).not.toHaveBeenCalled()
  })

  it('restaura perguntas e permissões que ficaram pendentes durante a queda', async () => {
    const client = attachClient({
      active: true,
      permissions: [{ id: 'p1', sessionID: 's1', action: 'bash', resources: ['rm -rf /tmp/x'] }],
      forms: [{ id: 'f1', sessionID: 's1', title: 'Como seguir?', fields: [{ key: 'q', type: 'string', title: 'Qual caminho?' }] }],
      events: [ev('session.execution.succeeded')],
    })
    const onForm = vi.fn()
    const onPermission = vi.fn()
    await runAgentTurn(client, { ...request(), text: '', attach: true, startedAt: 1000 }, { onForm, onPermission })
    expect(onPermission).toHaveBeenCalledWith({ id: 'p1', action: 'bash', resources: ['rm -rf /tmp/x'], message: null })
    expect(onForm).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1', title: 'Como seguir?' }))
  })

  it('reconecta o SSE e relê a pendência que nasceu no buraco da conexão (uma única vez)', async () => {
    // A pergunta só aparece na releitura DEPOIS da queda (o attach inicial não a viu).
    let formListCalls = 0
    let subscriptions = 0
    const client = {
      session: {
        switchAgent: vi.fn().mockResolvedValue(undefined),
        switchModel: vi.fn().mockResolvedValue(undefined),
        prompt: vi.fn().mockResolvedValue(undefined),
        interrupt: vi.fn().mockResolvedValue({}),
        get: vi.fn().mockResolvedValue({ time: { idle: 0 }, location: { directory: '/repo' } }),
        active: vi.fn().mockResolvedValue({ s1: { type: 'running' } }),
        form: {
          list: vi.fn(async () => {
            formListCalls += 1
            return formListCalls >= 2 ? [{ id: 'f1', sessionID: 's1', title: 'Como seguir?', fields: [] }] : []
          }),
        },
      },
      message: { list: vi.fn().mockResolvedValue({ data: [] }) },
      permission: { list: vi.fn().mockResolvedValue([]) },
      event: {
        subscribe: (opts: { onActivity?: () => void }) =>
          (async function* () {
            opts.onActivity?.()
            yield { type: 'server.connected', data: {} }
            subscriptions += 1
            if (subscriptions === 1) throw new Error('stream caiu')
            yield ev('session.execution.succeeded')
          })(),
      },
    } as unknown as OpencodeClient
    const onForm = vi.fn()
    const result = await runAgentTurn(client, { ...request(), text: '', attach: true, startedAt: 1000 }, { onForm })
    expect(result.outcome).toBe('succeeded')
    expect(subscriptions).toBe(2)
    expect(onForm).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }))
    const publishedForms = mocks.publish.mock.calls.map(([, payload]) => payload as { type: string; form?: { id: string } }).filter((payload) => payload.type === 'form')
    expect(publishedForms).toHaveLength(1)
    expect(publishedForms[0]!.form).toMatchObject({ id: 'f1' })
  })
})
