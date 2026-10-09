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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.config = {
    ai_opencode: { baseUrl: 'http://opencode:4096/', password: 'segredo' },
    ai_gemini: { apiKey: 'chave' },
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
