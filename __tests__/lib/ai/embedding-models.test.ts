import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Modelos de embedding (Engramind): Gemini por `embedContent`, OpenAI por id de embedding, e a rota
 * `GET /api/ai/providers/[provider]/models?kind=embedding` com cache separado e recusa de provedor sem suporte.
 */

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}))

vi.mock('@/lib/integrations/config', () => ({
  getIntegrationConfig: vi.fn(async () => ({ apiKey: 'chave' })),
  getIntegration: vi.fn(async () => ({ version: 'v1' })),
  isIntegrationConfigured: () => true,
}))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({}),
  debugFetch: (_dbg: unknown, _label: string, url: string, init: RequestInit) => mocks.fetch(url, init),
}))
vi.mock('@/lib/db', () => ({ dbConnect: async () => {} }))
vi.mock('@/lib/db/models/IntegrationStatus', () => ({ IntegrationStatus: { find: () => ({ lean: async () => [] }) } }))

import { NextRequest } from 'next/server'
import { listGeminiEmbeddingModels, listGeminiModels } from '@/lib/ai/gemini'
import { listOpenaiEmbeddingModels } from '@/lib/ai/openai'
import { clearAiCatalogCache } from '@/lib/ai/catalog'
import { GET } from '@/app/api/ai/providers/[provider]/models/route'

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
