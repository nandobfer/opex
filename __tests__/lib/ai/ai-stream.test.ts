import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  parts: [] as unknown[],
  streamText: vi.fn(),
  opencodeModel: vi.fn((id: string, settings: unknown) => ({ kind: 'opencode', id, settings })),
  dispose: vi.fn(async () => {}),
  google: vi.fn((id: string) => ({ kind: 'gemini', id })),
  anthropic: vi.fn((id: string) => ({ kind: 'anthropic', id })),
  openai: vi.fn((id: string) => ({ kind: 'openai', id })),
  deepseek: vi.fn((id: string) => ({ kind: 'deepseek', id })),
  goModel: vi.fn(),
  goCosts: [] as unknown[],
  record: vi.fn(async () => {}),
}))

vi.mock('ai', () => ({
  streamText: (options: unknown) => {
    mocks.streamText(options)
    return {
      fullStream: (async function* () {
        for (const part of mocks.parts) yield part
      })(),
    }
  },
}))
vi.mock('@/lib/ai/opencode', () => ({
  createOpencodeProvider: async () => ({ provider: Object.assign(mocks.opencodeModel, { dispose: mocks.dispose }), directory: '/home/eu/ia' }),
}))
vi.mock('@/lib/ai/gemini', () => ({ createGeminiProvider: async () => mocks.google }))
vi.mock('@/lib/ai/anthropic', () => ({ createAnthropicProvider: async () => mocks.anthropic }))
vi.mock('@/lib/ai/openai', () => ({ createOpenaiProvider: async () => mocks.openai }))
vi.mock('@/lib/ai/deepseek', () => ({ createDeepseekProvider: async () => mocks.deepseek }))
vi.mock('@/lib/ai/opencode-go', () => ({
  createOpencodeGoModel: async (id: string, options: unknown) => {
    mocks.goModel(id, options)
    return { model: { kind: 'opencode-go', id }, meter: { take: () => mocks.goCosts.shift() ?? null } }
  },
}))
vi.mock('@/lib/ai/consumption', () => ({ recordAiConsumption: mocks.record }))

import { streamAi, type AiStreamEvent } from '@/lib/ai/stream'

const usage = { inputTokens: 100, outputTokens: 20, totalTokens: 120 }

async function collect(request: Parameters<typeof streamAi>[0]): Promise<AiStreamEvent[]> {
  const events: AiStreamEvent[] = []
  for await (const event of streamAi(request)) events.push(event)
  return events
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.parts = []
  mocks.goCosts = []
})

describe('streamAi', () => {
  it('OpenCode: sessão nova com agente, variante e diretório; converte texto, ferramentas e custo', async () => {
    mocks.parts = [
      { type: 'reasoning-delta', id: 'r', text: 'hmm' },
      { type: 'tool-call', toolCallId: 't1', toolName: 'read', input: {} },
      { type: 'tool-result', toolCallId: 't1', toolName: 'read', output: {} },
      { type: 'text-delta', id: 'x', text: 'Olá' },
      { type: 'text-delta', id: 'x', text: ' mundo' },
      { type: 'finish-step', providerMetadata: { opencode: { cost: 0.0012 } } },
      { type: 'finish', finishReason: 'stop', totalUsage: usage },
    ]
    const events = await collect({ provider: 'opencode', model: 'anthropic/claude', agent: 'leitor', variant: 'high', temperature: 0.4, instructions: 'Seja claro', prompt: 'Tarefa', title: 'Entender' })

    expect(mocks.opencodeModel).toHaveBeenCalledWith('anthropic/claude', expect.objectContaining({ agent: 'leitor', variant: 'high', createNewSession: true, formPolicy: 'cancel', location: { directory: '/home/eu/ia' }, sessionTitle: 'Entender' }))
    const options = mocks.streamText.mock.calls[0]![0] as Record<string, unknown>
    expect(options).toMatchObject({ instructions: 'Seja claro', prompt: 'Tarefa' })
    // OpenCode ignora parâmetros de amostragem: nem são enviados.
    expect(options).not.toHaveProperty('temperature')

    expect(events.map((event) => event.type)).toEqual(['reasoning', 'tool', 'tool', 'delta', 'delta', 'done'])
    expect(events.at(-1)).toMatchObject({ type: 'done', finishReason: 'stop', usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, costUsd: 0.0012 } })
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
  })

  it('Gemini: temperatura, máximo de tokens e nível de thinking', async () => {
    mocks.parts = [{ type: 'finish', finishReason: 'stop', totalUsage: usage }]
    await collect({ provider: 'gemini', model: 'gemini-3-flash', variant: 'low', temperature: 0.3, maxOutputTokens: 2048, instructions: 'i', prompt: 'p' })
    expect(mocks.google).toHaveBeenCalledWith('gemini-3-flash')
    expect(mocks.streamText.mock.calls[0]![0]).toMatchObject({
      temperature: 0.3,
      maxOutputTokens: 2048,
      providerOptions: { google: { thinkingConfig: { thinkingLevel: 'low', includeThoughts: false } } },
    })
  })

  it('OpenAI e DeepSeek: nível de raciocínio pela opção `reasoning` da AI SDK, com temperatura e máximo de tokens', async () => {
    mocks.parts = [{ type: 'finish', finishReason: 'stop', totalUsage: usage }]
    await collect({ provider: 'openai', model: 'gpt-5', variant: 'medium', temperature: 0.2, maxOutputTokens: 1000, instructions: 'i', prompt: 'p' })
    expect(mocks.openai).toHaveBeenCalledWith('gpt-5')
    expect(mocks.streamText.mock.calls[0]![0]).toMatchObject({ reasoning: 'medium', temperature: 0.2, maxOutputTokens: 1000 })

    await collect({ provider: 'deepseek', model: 'deepseek-chat', temperature: 0.5, instructions: 'i', prompt: 'p' })
    expect(mocks.deepseek).toHaveBeenCalledWith('deepseek-chat')
    const options = mocks.streamText.mock.calls[1]![0] as Record<string, unknown>
    expect(options).toMatchObject({ temperature: 0.5 })
    expect(options).not.toHaveProperty('reasoning')
  })

  it('OpenCode Go: sessão estável, esforço do próprio modelo (inclui max), amostragem e custo = cobrado + cota no consumo', async () => {
    mocks.parts = [
      { type: 'reasoning-delta', id: 'r', text: 'pensando' },
      { type: 'text-delta', id: 'x', text: 'ok' },
      { type: 'finish-step', providerMetadata: {} },
      { type: 'finish', finishReason: 'stop', totalUsage: usage },
    ]
    mocks.goCosts = [{ costUsd: 0.00002, billing: { source: 'go', allowanceUsd: 0.00002, listCostUsd: 0.00003 } }]
    const events = await collect({
      provider: 'opencode-go', model: 'deepseek-v4.1-flash', variant: 'max', temperature: 0.4, maxOutputTokens: 500,
      session: 'opex-agent-1', instructions: 'i', prompt: 'p', consumption: { origin: 'task-summary', subject: 't1' },
    })
    expect(mocks.goModel).toHaveBeenCalledWith('deepseek-v4.1-flash', { session: 'opex-agent-1' })
    expect(mocks.streamText.mock.calls[0]![0]).toMatchObject({ model: { kind: 'opencode-go' }, reasoning: 'max', temperature: 0.4, maxOutputTokens: 500 })
    expect(events.map((event) => event.type)).toEqual(['reasoning', 'delta', 'done'])
    expect(events.at(-1)).toMatchObject({ usage: { costUsd: 0.00002 } })
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'opencode-go', model: 'deepseek-v4.1-flash', origin: 'task-summary', subject: 't1', costUsd: 0.00002,
      billing: { source: 'go', allowanceUsd: 0.00002, listCostUsd: 0.00003 },
    }))
  })

  it('OpenCode Go: sem custo informado fica null; esforço fora da lista não vai', async () => {
    mocks.parts = [{ type: 'finish-step', providerMetadata: {} }, { type: 'finish', finishReason: 'stop', totalUsage: usage }]
    const events = await collect({ provider: 'opencode-go', model: 'kimi-k3', variant: 'turbo', instructions: 'i', prompt: 'p' })
    expect(mocks.streamText.mock.calls[0]![0]).not.toHaveProperty('reasoning')
    expect(events.at(-1)).toMatchObject({ type: 'done', usage: { costUsd: null } })
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it('OpenCode Go: chave recusada (401) e cota esgotada (429) viram mensagens acionáveis, classificadas pelo status', async () => {
    const apiError = (statusCode: number) => Object.assign(new Error('Invalid credential oc_sk_segredo'), { statusCode })
    mocks.parts = [{ type: 'error', error: apiError(401) }, { type: 'finish', finishReason: 'error', totalUsage: usage }]
    const [denied] = await collect({ provider: 'opencode-go', model: 'm', instructions: 'i', prompt: 'p' })
    expect(denied).toMatchObject({ type: 'error', message: expect.stringContaining('O OpenCode Go recusou a chave (HTTP 401)') })
    expect((denied as { message: string }).message).not.toContain('oc_sk_segredo')

    mocks.parts = [{ type: 'error', error: apiError(429) }, { type: 'finish', finishReason: 'error', totalUsage: usage }]
    const [limited] = await collect({ provider: 'opencode-go', model: 'm', instructions: 'i', prompt: 'p' })
    expect(limited).toMatchObject({ message: expect.stringContaining('Limite do plano OpenCode Go atingido') })
  })

  it('Anthropic: com raciocínio ligado não envia temperatura (a API recusa); sem ele, envia', async () => {
    mocks.parts = [{ type: 'finish', finishReason: 'stop', totalUsage: usage }]
    await collect({ provider: 'anthropic', model: 'claude-sonnet-4-5', variant: 'high', temperature: 0.3, maxOutputTokens: 4000, instructions: 'i', prompt: 'p' })
    const thinking = mocks.streamText.mock.calls[0]![0] as Record<string, unknown>
    expect(thinking).toMatchObject({ reasoning: 'high', maxOutputTokens: 4000 })
    expect(thinking).not.toHaveProperty('temperature')

    await collect({ provider: 'anthropic', model: 'claude-sonnet-4-5', temperature: 0.3, instructions: 'i', prompt: 'p' })
    expect(mocks.streamText.mock.calls[1]![0]).toMatchObject({ temperature: 0.3 })
  })

  it('variante desconhecida não vira `reasoning`; JEV não gera texto', async () => {
    mocks.parts = [{ type: 'finish', finishReason: 'stop', totalUsage: usage }]
    await collect({ provider: 'openai', model: 'gpt-5', variant: 'turbo', instructions: 'i', prompt: 'p' })
    expect(mocks.streamText.mock.calls[0]![0]).not.toHaveProperty('reasoning')

    const events = await collect({ provider: 'jev', model: 'jev-latest', instructions: 'i', prompt: 'p' })
    expect(events).toEqual([{ type: 'error', message: 'O JEV decide de forma estruturada e não gera texto' }])
  })

  it('erro do provedor vira evento final de erro, sem "done"', async () => {
    mocks.parts = [
      { type: 'text-delta', id: 'x', text: 'parcial' },
      { type: 'error', error: new Error('401 Unauthorized') },
      { type: 'finish', finishReason: 'error', totalUsage: usage },
    ]
    const events = await collect({ provider: 'opencode', model: 'm', instructions: 'i', prompt: 'p' })
    expect(events.map((event) => event.type)).toEqual(['delta', 'error'])
    expect(events[1]).toMatchObject({ message: expect.stringContaining('Credencial recusada') })
    expect(mocks.dispose).toHaveBeenCalled()
  })

  it('OpenCode: falha informada só nos metadados do passo (finish "error") vira erro com a mensagem do servidor', async () => {
    mocks.parts = [
      { type: 'finish-step', providerMetadata: { opencode: { outcome: 'failed', cost: 0, error: { type: 'provider.invalid-request', message: 'Model exo-free has been deprecated.' } } } },
      { type: 'finish', finishReason: 'error', totalUsage: usage },
    ]
    const events = await collect({ provider: 'opencode', model: 'opencode/exo-free', instructions: 'i', prompt: 'p' })
    expect(events).toEqual([{ type: 'error', message: 'Model exo-free has been deprecated.' }])
  })

  it('pedido de aprovação de ferramenta vira aviso', async () => {
    mocks.parts = [{ type: 'tool-approval-request' }, { type: 'finish', finishReason: 'other', totalUsage: usage }]
    const events = await collect({ provider: 'opencode', model: 'm', instructions: 'i', prompt: 'p' })
    expect(events[0]).toMatchObject({ type: 'notice', message: expect.stringContaining('aprovação') })
  })
})
