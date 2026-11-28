import { legacyRoute } from '../../helpers/integrations-route'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Modelos de embedding (Engramind): Gemini por `embedContent`, OpenAI por id de embedding, e a rota
 * `GET /api/ai/providers/[provider]/models?kind=embedding` com cache separado e recusa de provedor sem suporte.
 */

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}))

vi.mock("@nandobfer/integracoes/modules/server/config", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
  getIntegrationConfig: vi.fn(async () => ({ apiKey: 'chave' })),
  getIntegration: vi.fn(async () => ({ version: 'v1' })),
  isIntegrationConfigured: () => true,
}))()) as Record<string, unknown>) }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/ai/api-keys", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => {
  const key = { id: 'key_ativa', name: 'Principal', apiKey: 'chave' }
  return { fetchWithKeyFailover: vi.fn(async (_id: string, _label: string, call: (k: typeof key) => Promise<Response>) => ({ response: await call(key), key })) }
})()) as Record<string, unknown>) }))
vi.mock("@nandobfer/integracoes/modules/server/debug", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
  integrationDebug: () => ({}),
  debugFetch: (_dbg: unknown, _label: string, url: string, init: RequestInit) => mocks.fetch(url, init),
}))()) as Record<string, unknown>) }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => {} }))
vi.mock("@nandobfer/integracoes/modules/mongoose/core-models", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ IntegrationStatus: { find: () => ({ lean: async () => [] }) } }))()) as Record<string, unknown>) }))

import { NextRequest } from 'next/server'
import { listGeminiEmbeddingModels, listGeminiModels } from "@nandobfer/integracoes/modules/integrations/ia/ai/gemini"
import { listOpenaiEmbeddingModels } from "@nandobfer/integracoes/modules/integrations/ia/ai/openai"
import { clearAiCatalogCache } from "@nandobfer/integracoes/modules/integrations/ia/ai/catalog"
const { GET } = legacyRoute("ai", "providers/[provider]/models")

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
const geminiModels = {
  models: [
    { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'], thinking: true },
    { name: 'models/gemini-embedding-001', displayName: 'Gemini Embedding 001', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/text-embedding-004', displayName: 'Text Embedding 004', supportedGenerationMethods: ['embedContent'] },
  ],
}
const openaiModels = { data: [{ id: 'gpt-4o', created: 3 }, { id: 'text-embedding-3-small', created: 2 }, { id: 'text-embedding-3-large', created: 4 }, { id: 'whisper-1', created: 1 }] }

beforeEach(() => {
  vi.clearAllMocks()
  clearAiCatalogCache()
  mocks.fetch.mockImplementation(async (url: string) => (url.includes('googleapis') ? json(geminiModels) : json(openaiModels)))
})

describe('listas de embedding', () => {
  it('Gemini: só os modelos com embedContent, sem variantes; a lista de chat continua sem eles', async () => {
    expect((await listGeminiEmbeddingModels()).map((model) => [model.id, model.variants])).toEqual([
      ['text-embedding-004', []],
      ['gemini-embedding-001', []],
    ])
    expect((await listGeminiModels()).map((model) => model.id)).toEqual(['gemini-2.5-flash'])
  })

  it('OpenAI: só os ids de embedding, do mais novo ao mais antigo', async () => {
    expect((await listOpenaiEmbeddingModels()).map((model) => model.id)).toEqual(['text-embedding-3-large', 'text-embedding-3-small'])
  })
})

describe('rota ?kind=embedding', () => {
  const call = (provider: string, query = '') => GET(new NextRequest(`http://opex/api/ai/providers/${provider}/models${query}`), { params: Promise.resolve({ provider }) })

  it('lista os de embedding e mantém a lista de chat em cache separado', async () => {
    const embedding = await (await call('openai', '?kind=embedding')).json()
    expect(embedding.data.map((model: { id: string }) => model.id)).toEqual(['text-embedding-3-large', 'text-embedding-3-small'])
    const chat = await (await call('openai')).json()
    expect(chat.data.map((model: { id: string }) => model.id)).toEqual(['gpt-4o'])
  })

  it('provedor sem embeddings ou tipo inválido: 422', async () => {
    expect((await call('anthropic', '?kind=embedding')).status).toBe(422)
    expect((await call('openai', '?kind=imagem')).status).toBe(422)
  })
})
