import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, Record<string, unknown>>,
  fetch: vi.fn(),
}))

vi.mock('@/lib/integrations/config', () => ({
  getIntegrationConfig: vi.fn(async (id: string) => mocks.config[id] ?? {}),
}))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({}),
  debugFetch: (_dbg: unknown, _label: string, url: string, init: RequestInit) => mocks.fetch(url, init),
}))

import { getOpencodeInfo, listOpencodeAgents, listOpencodeModels } from '@/lib/ai/opencode'
import { listGeminiModels } from '@/lib/ai/gemini'
import { listJevModels } from '@/lib/ai/jev'
import { AI_PROVIDERS, AI_TEXT_PROVIDER_IDS } from '@/lib/ai/providers'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.config = {
    ai_opencode: { baseUrl: 'http://opencode:4096/', password: 'segredo' },
    ai_gemini: { apiKey: 'chave' },
    ai_jev: { apiKey: 'chave-jev' },
  }
})

describe('OpenCode', () => {
  it('lista modelos habilitados como provedor/modelo, com variantes e marca os gratuitos', async () => {
    mocks.fetch.mockResolvedValue(
      json({
        data: [
          { id: 'claude-haiku', providerID: 'anthropic', name: 'Claude Haiku', variants: [{ id: 'low' }, { id: 'high' }], cost: [{ input: 0.1, output: 0.5 }], limit: { context: 200000 } },
          { id: 'big-pickle', providerID: 'opencode', name: 'Big Pickle', cost: [{ input: 0, output: 0 }] },
          { id: 'desligado', providerID: 'openai', enabled: false },
          { id: 'antigo', providerID: 'openai', status: 'deprecated' },
        ],
      }),
    )
    const models = await listOpencodeModels()
    expect(models.map((model) => model.id)).toEqual(['anthropic/claude-haiku', 'opencode/big-pickle'])
    expect(models[0]).toMatchObject({ variants: ['low', 'high'], contextWindow: 200000, free: false, group: 'anthropic' })
    expect(models[1]?.free).toBe(true)

    const [url, init] = mocks.fetch.mock.calls[0]!
    expect(url).toBe('http://opencode:4096/api/model')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('opencode:segredo').toString('base64')}`)
  })

  it('com diretório configurado, consulta o catálogo daquele local', async () => {
    mocks.config.ai_opencode!.directory = '/home/eu/ia'
    mocks.fetch.mockResolvedValue(json({ data: [] }))
    await listOpencodeModels()
    expect(mocks.fetch.mock.calls[0]![0]).toBe('http://opencode:4096/api/model?location[directory]=%2Fhome%2Feu%2Fia')
  })

  it('diretório configurado que não existe na máquina do OpenCode vira mensagem acionável', async () => {
    mocks.config.ai_opencode!.directory = '/home/burgos/opex'
    mocks.fetch.mockResolvedValue(json({}, 404))
    await expect(listOpencodeModels()).rejects.toThrow(
      'O OpenCode respondeu HTTP 404 em /api/model: confira se o diretório das sessões existe na máquina do OpenCode ("/home/burgos/opex")',
    )
  })

  it('agentes: só os primários e visíveis', async () => {
    mocks.fetch.mockResolvedValue(
      json({
        data: [
          { id: 'build', name: 'Build', mode: 'primary', description: 'Padrão' },
          { id: 'general', mode: 'subagent' },
          { id: 'interno', mode: 'primary', hidden: true },
        ],
      }),
    )
    expect(await listOpencodeAgents()).toEqual([{ id: 'build', name: 'Build', description: 'Padrão' }])
  })

  it('senha recusada e servidor 1.x viram mensagens acionáveis', async () => {
    mocks.fetch.mockResolvedValueOnce(json({}, 401))
    await expect(listOpencodeModels()).rejects.toThrow('O OpenCode recusou a senha (HTTP 401)')

    mocks.fetch.mockResolvedValueOnce(json({ version: '1.4.0' }))
    await expect(getOpencodeInfo()).rejects.toThrow('Versão do OpenCode incompatível (1.4.0)')
  })

  it('sem URL configurada, não chama a rede', async () => {
    mocks.config.ai_opencode = {}
    await expect(listOpencodeModels()).rejects.toThrow('OpenCode sem URL do servidor')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})

describe('Gemini', () => {
  it('lista só modelos de texto, sem o prefixo models/, com níveis de thinking quando suportado', async () => {
    mocks.fetch.mockResolvedValue(
      json({
        models: [
          { name: 'models/gemini-3-flash', displayName: 'Gemini 3 Flash', supportedGenerationMethods: ['generateContent'], thinking: true, inputTokenLimit: 1048576 },
          { name: 'models/gemini-2.0-flash-lite', displayName: 'Gemini 2.0 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
    )
    const models = await listGeminiModels()
    expect(models.map((model) => model.id)).toEqual(['gemini-3-flash', 'gemini-2.0-flash-lite'])
    expect(models[0]).toMatchObject({ name: 'Gemini 3 Flash', variants: ['low', 'medium', 'high'], contextWindow: 1048576 })
    expect(models[1]?.variants).toEqual([])
    expect((mocks.fetch.mock.calls[0]![1].headers as Record<string, string>)['x-goog-api-key']).toBe('chave')
  })

  it('API key recusada vira mensagem em pt-BR; sem chave nem chama a rede', async () => {
    mocks.fetch.mockResolvedValueOnce(json({}, 403))
    await expect(listGeminiModels()).rejects.toThrow('O Gemini recusou a API key (HTTP 403)')

    mocks.config.ai_gemini = {}
    mocks.fetch.mockClear()
    await expect(listGeminiModels()).rejects.toThrow('Gemini sem API key')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})

describe('JEV', () => {
  it('lista os modelos/aliases e envia a API key como Bearer', async () => {
    mocks.fetch.mockResolvedValue(
      json({
        models: [
          { name: 'jev-latest', description: 'Mais recente', release_date: '2026-01-01' },
          { name: 'jev-preview', description: 'Prévia', release_date: '2026-01-01' },
        ],
      }),
    )
    const models = await listJevModels()
    expect(models.map((model) => model.id)).toEqual(['jev-latest', 'jev-preview'])
    expect(models[0]).toMatchObject({ name: 'jev-latest', variants: [], contextWindow: null, free: false })

    const [url, init] = mocks.fetch.mock.calls[0]!
    expect(url).toBe('https://api.typesafe.ai/v1/models')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer chave-jev')
  })

  it('API key recusada vira mensagem em pt-BR; sem chave nem chama a rede', async () => {
    mocks.fetch.mockResolvedValueOnce(json({}, 401))
    await expect(listJevModels()).rejects.toThrow('O JEV recusou a API key (HTTP 401)')

    mocks.config.ai_jev = {}
    mocks.fetch.mockClear()
    await expect(listJevModels()).rejects.toThrow('JEV sem API key')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})

describe('capacidade dos provedores', () => {
  it('só os provedores de texto são oferecidos às features de texto (o JEV fica de fora)', () => {
    expect([...AI_TEXT_PROVIDER_IDS]).toEqual(AI_PROVIDERS.filter((provider) => provider.supportsTextGeneration).map((provider) => provider.id))
    expect(AI_TEXT_PROVIDER_IDS).not.toContain('jev')
    expect(AI_PROVIDERS.map((provider) => provider.id)).toContain('jev')
  })
})
