import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'crypto'

/**
 * Rodízio e troca de chave em falha (OPE-179): gerações seguidas começam em chaves diferentes, a chave
 * que falha (401/402/403/429) passa para a próxima, a que respondeu fica fixa no turno e o consumo vai
 * para ela. Com uma chave só, a resposta passa intacta (comportamento de antes).
 */

const mocks = vi.hoisted(() => ({ stored: null as Record<string, unknown> | null }))
vi.mock("@nandobfer/integracoes/modules/server/store", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ loadStoredIntegration: async () => mocks.stored, invalidateStoredIntegrations: vi.fn() }))()) as Record<string, unknown>) }))

import { encryptSecret } from '@/lib/crypto/secretBox'
import { AiProviderError } from "@nandobfer/integracoes/modules/integrations/ia/ai/errors"
import { createKeyFailoverFetch, fetchWithKeyFailover, getAiProviderKeyPool, requireAiProviderKeyOrder, resetAiKeyRotation, type AiProviderKey } from "@nandobfer/integracoes/modules/integrations/ia/ai/api-keys"

const saved = process.env.INTEGRATIONS_ENCRYPTION_KEY
const keyA: AiProviderKey = { id: 'key_a', name: 'Pessoal', apiKey: 'sk-a' }
const keyB: AiProviderKey = { id: 'key_b', name: 'Trabalho', apiKey: 'sk-b' }
const keyC: AiProviderKey = { id: 'key_c', name: 'Reserva', apiKey: 'sk-c' }

function storeKeys(keys: AiProviderKey[], primary: string | null = keys[0]?.id ?? null, selected = keys.map((key) => key.id)) {
  mocks.stored = {
    integrationId: 'ai_deepseek',
    apiKeys: keys.map((key, index) => ({ id: key.id, name: key.name, secret: encryptSecret(key.apiKey), createdAt: new Date(index), updatedAt: new Date(index) })),
    activeApiKeyId: primary,
    selectedApiKeyIds: selected,
  }
}

const status = (code: number) => new Response(JSON.stringify({ error: { message: `HTTP ${code}` } }), { status: code, headers: { 'Content-Type': 'application/json' } })
/** Quem recebeu cada chamada (pelo cabeçalho de autenticação). */
function recorder(respond: (auth: string) => Response) {
  const seen: string[] = []
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const auth = headers.get('authorization') ?? headers.get('x-api-key') ?? headers.get('x-goog-api-key') ?? ''
    seen.push(auth)
    return respond(auth)
  })
  return { fetchMock: fetchMock as unknown as typeof fetch, seen }
}

beforeEach(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  resetAiKeyRotation()
})
afterEach(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = saved
  vi.unstubAllGlobals()
})

describe('conjunto de chaves em uso', () => {
  it('gerações seguidas começam em chaves diferentes (rodízio por geração)', async () => {
    storeKeys([keyA, keyB, keyC])
    const starts = []
    for (let i = 0; i < 4; i++) starts.push((await requireAiProviderKeyOrder('ai_deepseek', 'DeepSeek'))[0]!.id)
    expect(starts).toEqual(['key_a', 'key_b', 'key_c', 'key_a'])
  })

  it('sem chave em uso: erro acionável de provedor não configurado', async () => {
    storeKeys([keyA], null)
    await expect(requireAiProviderKeyOrder('ai_deepseek', 'DeepSeek')).rejects.toThrow('DeepSeek sem chave de API ativa')
    expect(await getAiProviderKeyPool('ai_deepseek')).toEqual([])
  })

  it('só a principal em uso: o conjunto é ela (comportamento de antes)', async () => {
    storeKeys([keyA, keyB], 'key_b', ['key_b'])
    expect((await getAiProviderKeyPool('ai_deepseek')).map((key) => key.id)).toEqual(['key_b'])
  })
})

describe('fetch das SDKs com troca de chave', () => {
  it('401 na primeira chave passa para a segunda; a que respondeu fica fixa no turno e recebe o consumo', async () => {
    const { fetchMock, seen } = recorder((auth) => (auth.includes('sk-a') ? status(401) : new Response('{}', { status: 200 })))
    const keys = createKeyFailoverFetch({ order: [keyA, keyB], label: 'DeepSeek', baseFetch: fetchMock })
    expect(keys.initialApiKey).toBe('sk-a')
    const body = JSON.stringify({ model: 'x' })
    expect((await keys.fetch('https://api/chat', { method: 'POST', headers: { Authorization: 'Bearer sk-a' }, body })).status).toBe(200)
    expect(seen).toEqual(['Bearer sk-a', 'Bearer sk-b'])
    expect(keys.current().id).toBe('key_b')

    await keys.fetch('https://api/chat', { method: 'POST', headers: { Authorization: 'Bearer sk-a' }, body })
    expect(seen.at(-1)).toBe('Bearer sk-b')
    expect(seen).toHaveLength(3)
  })

  it('troca o segredo em qualquer cabeçalho da SDK (x-api-key, x-goog-api-key) e aplica o cabeçalho próprio', async () => {
    const calls: Headers[] = []
    const baseFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      calls.push(headers)
      return headers.get('x-api-key') === 'sk-a' ? status(429) : new Response('{}')
    }) as unknown as typeof fetch
    const keys = createKeyFailoverFetch({ order: [keyA, keyB], label: 'Anthropic', baseFetch, applyKey: (headers, key) => headers.set('Authorization', `Bearer ${key.apiKey}`) })
    await keys.fetch('https://api/messages', { method: 'POST', headers: { 'x-api-key': 'sk-a', 'x-goog-api-key': 'sk-a', 'anthropic-version': '1' }, body: '{}' })
    expect(calls[1]!.get('x-api-key')).toBe('sk-b')
    expect(calls[1]!.get('x-goog-api-key')).toBe('sk-b')
    expect(calls[1]!.get('authorization')).toBe('Bearer sk-b')
    expect(calls[1]!.get('anthropic-version')).toBe('1')
  })

  it('todas falhando: erro com a lista das chaves e o motivo de cada uma', async () => {
    const { fetchMock } = recorder((auth) => (auth.includes('sk-a') ? status(401) : status(429)))
    const keys = createKeyFailoverFetch({ order: [keyA, keyB], label: 'DeepSeek', baseFetch: fetchMock })
    const error = await keys.fetch('https://api/chat', { method: 'POST', headers: { Authorization: 'Bearer sk-a' }, body: '{}' }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AiProviderError)
    expect((error as Error).message).toBe('Todas as chaves em uso do DeepSeek falharam: “Pessoal” (HTTP 401, chave recusada), “Trabalho” (HTTP 429, limite ou cota).')
  })

  it('com uma chave só, um 429 passa intacto para a SDK (sem troca nem erro próprio)', async () => {
    const { fetchMock, seen } = recorder(() => status(429))
    const keys = createKeyFailoverFetch({ order: [keyA], label: 'DeepSeek', baseFetch: fetchMock })
    const response = await keys.fetch('https://api/chat', { method: 'POST', headers: { Authorization: 'Bearer sk-a' }, body: '{}' })
    expect(response.status).toBe(429)
    expect(seen).toEqual(['Bearer sk-a'])
  })

  it('500, erro de rede e corpo que não pode ser reenviado não trocam de chave', async () => {
    const server = recorder(() => status(500))
    const keys = createKeyFailoverFetch({ order: [keyA, keyB], label: 'DeepSeek', baseFetch: server.fetchMock })
    expect((await keys.fetch('https://api/chat', { method: 'POST', headers: { Authorization: 'Bearer sk-a' }, body: '{}' })).status).toBe(500)
    expect(server.seen).toHaveLength(1)

    const network = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    const offline = createKeyFailoverFetch({ order: [keyA, keyB], label: 'DeepSeek', baseFetch: network })
    await expect(offline.fetch('https://api/chat', { method: 'POST', body: '{}' })).rejects.toThrow('fetch failed')
    expect(network).toHaveBeenCalledOnce()

    const refused = recorder(() => status(401))
    const streamed = createKeyFailoverFetch({ order: [keyA, keyB], label: 'DeepSeek', baseFetch: refused.fetchMock })
    const body = new ReadableStream({ start: (controller) => controller.close() })
    expect((await streamed.fetch('https://api/chat', { method: 'POST', headers: { Authorization: 'Bearer sk-a' }, body, duplex: 'half' } as RequestInit)).status).toBe(401)
    expect(refused.seen).toHaveLength(1)
  })
})

describe('chamadas diretas com troca de chave', () => {
  it('giram por chamada e passam para a próxima em falha da chave; `keys` fixa a chave conferida', async () => {
    storeKeys([keyA, keyB])
    const call = vi.fn(async (key: AiProviderKey) => (key.id === 'key_a' ? status(403) : new Response('ok')))
    const first = await fetchWithKeyFailover('ai_deepseek', 'DeepSeek', call)
    expect(first.key.id).toBe('key_b')
    expect(call.mock.calls.map(([key]) => key.id)).toEqual(['key_a', 'key_b'])

    call.mockClear()
    const second = await fetchWithKeyFailover('ai_deepseek', 'DeepSeek', call)
    expect(second.key.id).toBe('key_b')
    expect(call.mock.calls.map(([key]) => key.id)).toEqual(['key_b'])

    const pinned = await fetchWithKeyFailover('ai_deepseek', 'DeepSeek', call, { keys: [keyA] })
    expect(pinned.response.status).toBe(403)
  })
})

describe('geração real da AI SDK com várias chaves', () => {
  it('a SDK do DeepSeek gera com a segunda chave quando a primeira é recusada; o erro de todas chega legível', async () => {
    storeKeys([keyA, keyB])
    const completion = { id: 'c1', object: 'chat.completion', created: 1, model: 'deepseek-chat', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    const { fetchMock, seen } = recorder((auth) => (auth.includes('sk-a') ? status(401) : new Response(JSON.stringify(completion), { headers: { 'Content-Type': 'application/json' } })))
    vi.stubGlobal('fetch', fetchMock)
    const { createDeepseekProvider } = await import('@nandobfer/integracoes/modules/integrations/ia/ai/deepseek')
    const { generateText } = await import('ai')
    const { provider, currentKeyId } = await createDeepseekProvider()
    const result = await generateText({ model: provider('deepseek-chat'), prompt: 'oi' })
    expect(result.text).toBe('ok')
    expect(seen).toEqual(['Bearer sk-a', 'Bearer sk-b'])
    expect(currentKeyId()).toBe('key_b')

    const refused = recorder(() => status(401))
    vi.stubGlobal('fetch', refused.fetchMock)
    const again = await createDeepseekProvider()
    const error = await generateText({ model: again.provider('deepseek-chat'), prompt: 'oi', maxRetries: 0 }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AiProviderError)
    expect((error as Error).message).toContain('Todas as chaves em uso do DeepSeek falharam')
  })
})
