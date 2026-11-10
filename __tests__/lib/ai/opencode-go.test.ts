import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-154: provedor OpenCode Go (inferência pela API do gateway, sem sessão do OpenCode no host).
 * OPE-156: a chave vem do chaveiro (a chave em uso), e o modelo devolve o id dela para o consumo. */

const mocks = vi.hoisted(() => ({
  key: null as { id: string; name: string; apiKey: string } | null,
  requireKey: vi.fn(),
  fetch: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/lib/ai/api-keys', async () => {
  const { AiProviderError } = await import('@/lib/ai/errors')
  return {
    requireActiveAiProviderKey: mocks.requireKey.mockImplementation(async (integrationId: string, name: string) => {
      if (integrationId !== 'ai_opencode_go' || !mocks.key) throw new AiProviderError(`${name} sem chave de API ativa: cadastre e ative uma chave em Integrações › Inteligência Artificial › ${name}`)
      return mocks.key
    }),
  }
})
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ warn: mocks.warn, info: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({}),
  debugFetch: (_dbg: unknown, _label: string, url: string, init: RequestInit) => mocks.fetch(url, init),
}))

import { streamText } from 'ai'
import { clearOpencodeGoCatalogCache, createOpencodeGoModel, listOpencodeGoModels, verifyOpencodeGoKey } from '@/lib/ai/opencode-go'
import { OPENCODE_GO_USER_AGENT } from '@/lib/ai/endpoints'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const sse = (events: unknown[]) =>
  new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } })

const flash = {
  id: 'deepseek-v4.1-flash',
  name: 'DeepSeek V4.1 Flash',
  type: 'chat',
  canonical_id: 'deepseek/deepseek-v4.1-flash',
  modalities: { input: ['text', 'image/png'] },
  capabilities: { reasoning: { supported: true, effort: ['low', 'high', 'max'] } },
  limit: { context: 1000000 },
  cost: { text: { input: { price: 0.15 }, output: { price: 0.6 } } },
  api: { 'chat-completions': { base_url: 'https://opencode.ai/inference/go/openai/v1' } },
}
const catalog = {
  object: 'list',
  data: [
    flash,
    { id: 'claude-haiku-5-5', type: 'chat', canonical_id: 'anthropic/claude-haiku-5-5', capabilities: { reasoning: { effort: ['low', 'max'] } }, api: { messages: { base_url: 'https://opencode.ai/inference/go/anthropic/v1' } } },
    { id: 'gpt-6-luna', type: 'chat', api: { responses: { base_url: 'https://opencode.ai/inference/go/openai/v1' } } },
    { id: 'gemini-4-argon', type: 'chat', api: { 'generate-content': { base_url: 'https://evil.example/v1' } } },
    { id: 'longcat-2.5-free', type: 'chat', cost: { text: { input: { price: 0 }, output: { price: 0 } } }, api: { 'chat-completions': {} } },
    { id: 'imagem-x', type: 'image', api: { images: {} } },
  ],
}

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  clearOpencodeGoCatalogCache()
  mocks.key = { id: 'key_go_1', name: 'Chave principal', apiKey: 'oc_sk_teste' }
})

describe('listOpencodeGoModels', () => {
  it('lista todos os modelos de texto do Go, com esforços do próprio modelo, contexto, tipos de entrada e gratuitos marcados', async () => {
    mocks.fetch.mockResolvedValue(json(catalog))
    const models = await listOpencodeGoModels()
    expect(models.map((model) => model.id)).toEqual(['claude-haiku-5-5', 'deepseek-v4.1-flash', 'gemini-4-argon', 'gpt-6-luna', 'longcat-2.5-free'])
    expect(models.find((model) => model.id === 'deepseek-v4.1-flash')).toEqual({
      id: 'deepseek-v4.1-flash',
      name: 'DeepSeek V4.1 Flash',
      variants: ['low', 'high', 'max'],
      group: 'deepseek',
      contextWindow: 1000000,
      free: false,
      inputModalities: ['text', 'image/png'],
    })
    expect(models.find((model) => model.id === 'longcat-2.5-free')?.free).toBe(true)

    const [url, init] = mocks.fetch.mock.calls[0]!
    expect(url).toBe('https://opencode.ai/inference/go/openai/v1/models')
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(OPENCODE_GO_USER_AGENT)
  })

  it('sem chave em uso no chaveiro: erro acionável em pt-BR e nenhuma chamada (listagem, conferência e geração)', async () => {
    mocks.key = null
    const message = 'OpenCode Go sem chave de API ativa: cadastre e ative uma chave em Integrações › Inteligência Artificial › OpenCode Go'
    await expect(listOpencodeGoModels()).rejects.toThrow(message)
    await expect(verifyOpencodeGoKey()).rejects.toThrow(message)
    await expect(createOpencodeGoModel('deepseek-v4.1-flash')).rejects.toThrow(message)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})

describe('verifyOpencodeGoKey', () => {
  it('chave aceita: o pedido ao modelo inexistente volta 400 (sem gerar nada)', async () => {
    mocks.fetch.mockResolvedValue(json({ error: { type: 'server_error', message: 'Upstream request failed: Model is unavailable.' } }, 400))
    await expect(verifyOpencodeGoKey()).resolves.toBeUndefined()
    const [url, init] = mocks.fetch.mock.calls[0]!
    expect(url).toBe('https://opencode.ai/inference/go/openai/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer oc_sk_teste')
    expect(headers['x-opencode-session']).toMatch(/^opex-probe-/)
    expect(JSON.parse(init.body as string).model).toBe('__opex_probe__')
  })

  it('chave recusada (401): mensagem acionável, sem a chave', async () => {
    mocks.fetch.mockResolvedValue(json({ error: { type: 'authentication_error', message: 'Invalid credential' } }, 401))
    const error = await verifyOpencodeGoKey().catch((caught: Error) => caught)
    expect((error as Error).message).toContain('O OpenCode Go recusou a chave (HTTP 401)')
    expect((error as Error).message).not.toContain('oc_sk_teste')
  })
})

describe('chaveiro do Go (OPE-156)', () => {
  it('a troca da chave em uso vale na próxima chamada: listagem, conferência e geração usam a chave ativa e o modelo devolve o id dela', async () => {
    mocks.fetch.mockImplementation(async (url: string) => (url.endsWith('/models') ? json(catalog) : json({ error: {} }, 400)))
    await listOpencodeGoModels()
    mocks.key = { id: 'key_go_2', name: 'Reserva', apiKey: 'oc_sk_reserva' }
    await verifyOpencodeGoKey()
    clearOpencodeGoCatalogCache()
    const { apiKeyId } = await createOpencodeGoModel('deepseek-v4.1-flash')
    expect(apiKeyId).toBe('key_go_2')
    const auth = mocks.fetch.mock.calls.map(([, init]) => (init.headers instanceof Headers ? init.headers.get('authorization') : (init.headers as Record<string, string>).Authorization))
    expect(auth).toEqual(['Bearer oc_sk_teste', 'Bearer oc_sk_reserva', 'Bearer oc_sk_reserva'])
    expect(mocks.requireKey).toHaveBeenCalledWith('ai_opencode_go', 'OpenCode Go')
  })
})

describe('createOpencodeGoModel', () => {
  it('Chat Completions: sessão estável, User-Agent próprio, chave Bearer, streaming e custo medido do usage do Go', async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/models')) return json(catalog)
      return sse([
        { id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'deepseek-v4.1-flash', choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: 'pensa' } }] },
        { id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'deepseek-v4.1-flash', choices: [{ index: 0, delta: { content: 'ok' } }] },
        {
          id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'deepseek-v4.1-flash',
          choices: [{ index: 0, finish_reason: 'stop', delta: {} }],
          usage: { prompt_tokens: 35, completion_tokens: 34, total_tokens: 69, cost: 0, opencode: { billing_source: 'go', list_cost: 0.00002565, allowance: 0.00001539 } },
        },
      ])
    })
    const { model, meter, apiKeyId } = await createOpencodeGoModel('deepseek-v4.1-flash', { session: 'opex-agent-abc' })
    expect(apiKeyId).toBe('key_go_1')
    const result = streamText({ model, prompt: 'Diga ok', reasoning: 'max' })
    let text = ''
    let reasoning = ''
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') text += part.text
      if (part.type === 'reasoning-delta') reasoning += part.text
    }
    expect(text).toBe('ok')
    expect(reasoning).toBe('pensa')
    expect(meter.take()).toEqual({ costUsd: 0.00001539, billing: { source: 'go', allowanceUsd: 0.00001539, listCostUsd: 0.00002565 } })
    expect(meter.take()).toBeNull()

    const call = mocks.fetch.mock.calls.find(([url]) => String(url).endsWith('/chat/completions'))!
    expect(call[0]).toBe('https://opencode.ai/inference/go/openai/v1/chat/completions')
    const headers = call[1].headers as Headers
    expect(headers.get('x-opencode-session')).toBe('opex-agent-abc')
    expect(headers.get('user-agent')).toBe(OPENCODE_GO_USER_AGENT)
    expect(headers.get('authorization')).toBe('Bearer oc_sk_teste')
    const body = JSON.parse(call[1].body as string)
    expect(body).toMatchObject({ model: 'deepseek-v4.1-flash', stream: true, reasoning_effort: 'max' })
  })

  it('cada modelo vai pela API que o catálogo declara; base fora do gateway é ignorada', async () => {
    const urls: string[] = []
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/models')) return json(catalog)
      urls.push(url)
      return json({ error: { message: 'parar aqui' } }, 400)
    })
    for (const id of ['claude-haiku-5-5', 'gpt-6-luna', 'gemini-4-argon', 'desconhecido']) {
      const { model } = await createOpencodeGoModel(id)
      const result = streamText({ model, prompt: 'x', maxRetries: 0 })
      for await (const part of result.fullStream) void part
    }
    expect(urls).toEqual([
      'https://opencode.ai/inference/go/anthropic/v1/messages',
      'https://opencode.ai/inference/go/openai/v1/responses',
      'https://opencode.ai/inference/go/google/v1beta/models/gemini-4-argon:streamGenerateContent?alt=sse',
      'https://opencode.ai/inference/go/openai/v1/chat/completions',
    ])
  })

  it('sem sessão informada, cada geração ganha um id próprio', async () => {
    mocks.fetch.mockImplementation(async (url: string) => (url.endsWith('/models') ? json(catalog) : json({ error: { message: 'x' } }, 400)))
    const sessions: string[] = []
    for (let i = 0; i < 2; i++) {
      const { model } = await createOpencodeGoModel('deepseek-v4.1-flash')
      for await (const part of streamText({ model, prompt: 'x', maxRetries: 0 }).fullStream) void part
    }
    for (const [url, init] of mocks.fetch.mock.calls) if (!String(url).endsWith('/models')) sessions.push((init.headers as Headers).get('x-opencode-session')!)
    expect(sessions).toHaveLength(2)
    expect(sessions[0]).toMatch(/^opex-/)
    expect(sessions[0]).not.toBe(sessions[1])
  })
})

describe('catálogo no caminho da geração (cancelamento, limite e último catálogo bom)', () => {
  const firstGenerationUrl = () => mocks.fetch.mock.calls.map(([url]) => String(url)).find((url) => !url.endsWith('/models'))

  it('a consulta ao catálogo sempre leva um sinal com limite próprio, mesmo sem cancelamento de quem pediu', async () => {
    mocks.fetch.mockImplementation(async (url: string) => (url.endsWith('/models') ? json(catalog) : json({ error: { message: 'x' } }, 400)))
    await createOpencodeGoModel('deepseek-v4.1-flash')
    const [, init] = mocks.fetch.mock.calls[0]!
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('cancelamento de quem pediu alcança a consulta pendurada e interrompe o preparo', async () => {
    mocks.fetch.mockImplementation(
      (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('abortado', 'AbortError')))),
    )
    const controller = new AbortController()
    const pending = createOpencodeGoModel('claude-haiku-5-5', { signal: controller.signal })
    setTimeout(() => controller.abort(), 10)
    await expect(pending).rejects.toThrow()
  })

  it('catálogo vencido e fora do ar: usa o último catálogo lido (a rota do modelo continua certa) e avisa no log', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    mocks.fetch.mockResolvedValueOnce(json(catalog))
    await listOpencodeGoModels()
    vi.setSystemTime(Date.now() + 10 * 60_000)
    mocks.fetch.mockImplementation(async (url: string) => (url.endsWith('/models') ? json({ error: 'fora' }, 503) : json({ error: { message: 'x' } }, 400)))
    const { model } = await createOpencodeGoModel('claude-haiku-5-5')
    for await (const part of streamText({ model, prompt: 'x', maxRetries: 0 }).fullStream) void part
    expect(firstGenerationUrl()).toBe('https://opencode.ai/inference/go/anthropic/v1/messages')
    expect(mocks.warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('usando o último catálogo lido'))
  })

  it('sem catálogo nenhum: vai por Chat Completions e registra o motivo no log', async () => {
    mocks.fetch.mockImplementation(async (url: string) => (url.endsWith('/models') ? json({ error: 'fora' }, 503) : json({ error: { message: 'x' } }, 400)))
    const { model } = await createOpencodeGoModel('claude-haiku-5-5')
    for await (const part of streamText({ model, prompt: 'x', maxRetries: 0 }).fullStream) void part
    expect(firstGenerationUrl()).toBe('https://opencode.ai/inference/go/openai/v1/chat/completions')
    expect(mocks.warn).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-5-5', catalog: false }), expect.stringContaining('usando Chat Completions'))
  })
})
