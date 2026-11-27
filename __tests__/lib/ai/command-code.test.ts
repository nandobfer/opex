import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-190: provedor Command Code (Provider API), com a chave do chaveiro e a rota de cada modelo pelo catálogo. */

const mocks = vi.hoisted(() => ({
  keys: [] as { id: string; name: string; apiKey: string }[],
  fetch: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/api-keys', async (importOriginal) => {
  const { AiProviderError } = await import('@nandobfer/integracoes/modules/integrations/ia/ai/errors')
  const original = (await importOriginal()) as { createKeyFailoverFetch: unknown }
  const requireOrder = vi.fn(async (integrationId: string, name: string) => {
    if (integrationId !== 'ai_command_code' || !mocks.keys.length) throw new AiProviderError(`${name} sem chave de API ativa: cadastre e ative uma chave em Integrações › Inteligência Artificial › ${name}`)
    return mocks.keys
  })
  const fetchWithKeyFailover = async (integrationId: string, label: string, call: (key: unknown) => Promise<Response>, options: { keys?: unknown[] } = {}) => {
    const keys = options.keys?.length ? options.keys : await requireOrder(integrationId, label)
    return { response: await call(keys[0]), key: keys[0] }
  }
  return { createKeyFailoverFetch: original.createKeyFailoverFetch, requireAiProviderKeyOrder: requireOrder, fetchWithKeyFailover }
})
vi.mock("@/lib/logger", () => ({ loggerFor: () => ({ warn: mocks.warn, info: vi.fn(), error: vi.fn() }) }))
vi.mock("@/lib/integrations/server", () => ({
  integrationDebug: () => ({}),
  debugFetch: (_dbg: unknown, _label: string, url: string, init: RequestInit) => mocks.fetch(url, init),
}))

import { streamText } from 'ai'
import { clearCommandCodeCatalogCache, commandCodeModelInputs, createCommandCodeModel, listCommandCodeModels, verifyCommandCodeKey } from "@nandobfer/integracoes/modules/integrations/ia/ai/command-code"
import { COMMAND_CODE_USER_AGENT } from "@nandobfer/integracoes/modules/integrations/ia/ai/endpoints"
import { describeAiError, prepareModel } from "@nandobfer/integracoes/modules/integrations/ia/ai/stream"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const routing = {
  object: 'list',
  data: [
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', context_length: 1000000, supported_endpoints: ['/messages'] },
    { id: 'gpt-6-astra', name: 'GPT-6 Astra', context_length: 1050000, supported_endpoints: ['/chat/completions', '/responses'] },
    { id: 'gpt-6-responses', supported_endpoints: ['/responses'] },
    { id: 'deepseek/deepseek-v4-flash', supported_endpoints: ['/chat/completions'] },
    { id: 'typesafe/jev', supported_endpoints: ['/systemone'] },
  ],
}
const client = {
  data: [
    { id: 'claude-sonnet-5-5', display: { group: 'Anthropic', label: 'Claude Sonnet 5.5' }, inputModalities: ['text', 'image'], reasoningEfforts: ['low', 'high', 'max', 'turbo'], pricing: { inputCost: 2, outputCost: 10 } },
    { id: 'deepseek/deepseek-v4-flash', display: { group: 'DeepSeek' }, inputModalities: ['text'], reasoningEfforts: [], pricing: { inputCost: 0, outputCost: 0 } },
  ],
}

const catalogFetch = (generation: (url: string, init: RequestInit) => Response | Promise<Response>) => async (url: string, init: RequestInit) => {
  if (url.endsWith('/models')) return json(routing)
  if (url.endsWith('/models?view=client')) return json(client)
  return generation(url, init)
}

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  clearCommandCodeCatalogCache()
  mocks.keys = [{ id: 'key_cc_1', name: 'Chave principal', apiKey: 'user_teste' }]
})

describe('listCommandCodeModels', () => {
  it('une as rotas e a visão de cliente: esforços aceitos pela AI SDK, grupo, contexto, tipos de entrada e gratuitos; JEV fica de fora', async () => {
    mocks.fetch.mockImplementation(catalogFetch(() => json({}, 500)))
    const models = await listCommandCodeModels()
    expect(models.map((model) => model.id)).toEqual(['claude-sonnet-5-5', 'deepseek/deepseek-v4-flash', 'gpt-6-astra', 'gpt-6-responses'])
    expect(models[0]).toEqual({ id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', variants: ['low', 'high', 'max'], group: 'Anthropic', contextWindow: 1000000, free: false, inputModalities: ['text', 'image'] })
    expect(models.find((model) => model.id === 'deepseek/deepseek-v4-flash')?.free).toBe(true)
    const [url, init] = mocks.fetch.mock.calls[0]!
    expect(url).toBe('https://api.commandcode.ai/provider/v1/models')
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(COMMAND_CODE_USER_AGENT)
    // O catálogo é público: não leva a chave.
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('sem a visão de cliente, lista pelas rotas (sem esforços) e avisa no log', async () => {
    mocks.fetch.mockImplementation(async (url: string) => (url.endsWith('/models') ? json(routing) : json({}, 503)))
    const models = await listCommandCodeModels()
    expect(models.map((model) => model.id)).toContain('gpt-6-astra')
    expect(models.every((model) => model.variants.length === 0)).toBe(true)
    expect(mocks.warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('visão de cliente'))
  })

  it('tipos de entrada do modelo pelo catálogo (arquivos do Agente Opex)', async () => {
    mocks.fetch.mockImplementation(catalogFetch(() => json({}, 500)))
    expect(await commandCodeModelInputs('claude-sonnet-5-5')).toEqual(['text', 'image'])
    expect(await commandCodeModelInputs('gpt-6-astra')).toEqual(['text'])
  })
})

describe('verifyCommandCodeKey', () => {
  it('chave aceita: o pedido ao modelo inexistente volta 400 (sem gerar nada), com o Bearer e o User-Agent', async () => {
    mocks.fetch.mockResolvedValue(json({ error: { type: 'invalid_request_error' } }, 400))
    await expect(verifyCommandCodeKey()).resolves.toBeUndefined()
    const [url, init] = mocks.fetch.mock.calls[0]!
    expect(url).toBe('https://api.commandcode.ai/provider/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer user_teste')
    expect(JSON.parse(init.body as string).model).toBe('__opex_probe__')
  })

  it('chave recusada (401): mensagem acionável, sem a chave', async () => {
    mocks.fetch.mockResolvedValue(json({ error: { type: 'authentication_error' } }, 401))
    const error = (await verifyCommandCodeKey().catch((caught: Error) => caught)) as Error
    expect(error.message).toContain('O Command Code recusou a chave (HTTP 401)')
    expect(error.message).not.toContain('user_teste')
  })

  it('plano Go (403 upgrade_required): explica que o plano não tem acesso à API', async () => {
    mocks.fetch.mockResolvedValue(json({ error: { type: 'permission_error', code: 'upgrade_required' } }, 403))
    await expect(verifyCommandCodeKey()).rejects.toThrow('não tem acesso à API (HTTP 403, upgrade_required)')
  })

  it('sem chave em uso: erro em pt-BR e nenhuma chamada', async () => {
    mocks.keys = []
    await expect(verifyCommandCodeKey()).rejects.toThrow('Command Code sem chave de API ativa')
    await expect(createCommandCodeModel('gpt-6-astra')).rejects.toThrow('Command Code sem chave de API ativa')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})

describe('createCommandCodeModel', () => {
  it('cada modelo vai pela API do catálogo, sempre na base oficial; sem catálogo, Claude vai por Messages', async () => {
    const urls: string[] = []
    mocks.fetch.mockImplementation(
      catalogFetch((url) => {
        urls.push(url)
        return json({ error: { message: 'parar aqui' } }, 400)
      }),
    )
    for (const id of ['claude-sonnet-5-5', 'gpt-6-astra', 'gpt-6-responses', 'deepseek/deepseek-v4-flash']) {
      const { model } = await createCommandCodeModel(id)
      for await (const part of streamText({ model, prompt: 'x', maxRetries: 0 }).fullStream) void part
    }
    expect(urls).toEqual([
      'https://api.commandcode.ai/provider/v1/messages',
      'https://api.commandcode.ai/provider/v1/chat/completions',
      'https://api.commandcode.ai/provider/v1/responses',
      'https://api.commandcode.ai/provider/v1/chat/completions',
    ])

    urls.length = 0
    clearCommandCodeCatalogCache()
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes('/models')) return json({}, 503)
      urls.push(url)
      return json({ error: { message: 'x' } }, 400)
    })
    const { model } = await createCommandCodeModel('claude-opus-5')
    for await (const part of streamText({ model, prompt: 'x', maxRetries: 0 }).fullStream) void part
    expect(urls).toEqual(['https://api.commandcode.ai/provider/v1/messages'])
    expect(mocks.warn).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-5', catalog: false }), expect.stringContaining('modelo sem rota no catálogo'))
  })

  it('rodízio: um 429 troca para a próxima chave em uso, o pedido vai com o Bearer dela e o consumo é atribuído a ela', async () => {
    mocks.keys = [
      { id: 'key_cc_1', name: 'Pessoal', apiKey: 'user_a' },
      { id: 'key_cc_2', name: 'Trabalho', apiKey: 'user_b' },
    ]
    const auth: (string | null)[] = []
    mocks.fetch.mockImplementation(
      catalogFetch((_url, init) => {
        const header = (init.headers as Headers).get('authorization')
        auth.push(header)
        return header === 'Bearer user_a' ? json({ error: { message: 'limite' } }, 429) : json({ error: { message: 'parar' } }, 400)
      }),
    )
    const { model, currentKeyId } = await createCommandCodeModel('gpt-6-astra')
    for await (const part of streamText({ model, prompt: 'x', maxRetries: 0 }).fullStream) void part
    expect(auth).toEqual(['Bearer user_a', 'Bearer user_b'])
    expect(currentKeyId()).toBe('key_cc_2')
  })
})

describe('prepareModel (Command Code)', () => {
  it('a variante válida vira o reasoning da AI SDK; a inválida é ignorada; sem custo', async () => {
    mocks.fetch.mockImplementation(catalogFetch(() => json({ error: { message: 'x' } }, 400)))
    const prepared = await prepareModel({ provider: 'command-code', model: 'claude-sonnet-5-5', variant: 'high' })
    expect(prepared.reasoning).toBe('high')
    expect(prepared.takeStepCost({})).toBeNull()
    expect((await prepareModel({ provider: 'command-code', model: 'claude-sonnet-5-5', variant: 'turbo' })).reasoning).toBeUndefined()
    expect((await prepareModel({ provider: 'command-code', model: 'claude-sonnet-5-5', variant: null })).reasoning).toBeUndefined()
  })

  it('apiKeyId acompanha o rodízio: começa na primeira chave e passa para a que respondeu depois do 429', async () => {
    mocks.keys = [
      { id: 'key_cc_1', name: 'Pessoal', apiKey: 'user_a' },
      { id: 'key_cc_2', name: 'Trabalho', apiKey: 'user_b' },
    ]
    mocks.fetch.mockImplementation(
      catalogFetch((_url, init) => ((init.headers as Headers).get('authorization') === 'Bearer user_a' ? json({ error: { message: 'limite' } }, 429) : json({ error: { message: 'parar' } }, 400))),
    )
    const prepared = await prepareModel({ provider: 'command-code', model: 'gpt-6-astra', variant: null })
    expect(prepared.apiKeyId).toBe('key_cc_1')
    for await (const part of streamText({ model: prepared.model, prompt: 'x', maxRetries: 0 }).fullStream) void part
    expect(prepared.apiKeyId).toBe('key_cc_2')
  })
})

describe('describeAiError (Command Code)', () => {
  it('classifica pelo status: 401, 402, 403 (plano/modelo ou upgrade_required) e 429 em pt-BR', () => {
    expect(describeAiError({ statusCode: 401, message: 'x' }, 'command-code')).toContain('recusou a chave (HTTP 401)')
    expect(describeAiError({ statusCode: 402, message: 'x' }, 'command-code')).toContain('Sem créditos')
    expect(describeAiError({ statusCode: 403, message: 'x' }, 'command-code')).toContain('pode exigir um plano superior')
    expect(describeAiError({ statusCode: 403, message: 'x', responseBody: '{"code":"upgrade_required"}' }, 'command-code')).toContain('upgrade_required')
    expect(describeAiError({ statusCode: 429, message: 'x' }, 'command-code')).toContain('janela de 5 horas ou semanal')
  })
})
