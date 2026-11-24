import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-154: teste de conexão do OpenCode Go (lista os modelos e confere a chave, que a lista pública não prova).
 * OPE-179: com várias chaves em uso, cada uma é conferida e a que falha aparece no aviso.
 */

const mocks = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  models: vi.fn(),
  verify: vi.fn(),
  pool: [] as { id: string; name: string; apiKey: string }[],
  listGemini: vi.fn(),
}))

vi.mock('@/lib/integrations/config', () => ({
  getIntegration: vi.fn(async () => ({ values: mocks.values })),
  isIntegrationConfigured: vi.fn(() => true),
}))
vi.mock('@/lib/ai/catalog', () => ({ clearAiCatalogCache: vi.fn(), listAiAgents: vi.fn(), listAiModels: mocks.models }))
vi.mock('@/lib/ai/opencode', () => ({ getOpencodeInfo: vi.fn() }))
vi.mock('@/lib/ai/opencode-go', () => ({ verifyOpencodeGoKey: mocks.verify }))
vi.mock('@/lib/ai/api-keys', () => ({ getAiProviderKeyPool: async () => mocks.pool }))
vi.mock('@/lib/ai/gemini', () => ({ listGeminiModels: mocks.listGemini }))
vi.mock('@/lib/ai/anthropic', () => ({ listAnthropicModels: vi.fn() }))
vi.mock('@/lib/ai/openai', () => ({ listOpenaiModels: vi.fn() }))
vi.mock('@/lib/ai/deepseek', () => ({ listDeepseekModels: vi.fn() }))
vi.mock('@/lib/ai/jev', () => ({ listJevModels: vi.fn() }))

import { AiProviderError } from '@/lib/ai/errors'
import { testGemini, testOpencodeGo } from '@/features/ai/server/testers'

const run = () => testOpencodeGo({ emit: vi.fn(), signal: new AbortController().signal })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.values = { apiKey: 'oc_sk_x' }
  mocks.models.mockResolvedValue([{ id: 'deepseek-v4.1-flash' }, { id: 'deepseek-v4-pro' }])
  mocks.verify.mockResolvedValue(undefined)
  mocks.pool = [{ id: 'key_a', name: 'Assinatura', apiKey: 'oc_sk_x' }]
})

describe('testOpencodeGo', () => {
  it('chave aceita: lista os modelos do Go e confere a chave', async () => {
    expect(await run()).toBe('Chave aceita; 2 modelo(s)')
    expect(mocks.models).toHaveBeenCalledWith('opencode-go', expect.objectContaining({ fresh: true }))
    expect(mocks.verify).toHaveBeenCalledTimes(1)
  })

  it('sem chave: falha sem chamar o Go', async () => {
    mocks.values = {}
    await expect(run()).rejects.toThrow('Sem chave de API ativa: cadastre e ative uma chave oc_sk_… do OpenCode Go em Chaves de API')
    expect(mocks.models).not.toHaveBeenCalled()
  })

  it('chave recusada: falha com a mensagem do provedor mesmo com a lista de modelos respondendo', async () => {
    mocks.verify.mockRejectedValue(new AiProviderError('O OpenCode Go recusou a chave (HTTP 401)'))
    await expect(run()).rejects.toThrow('O OpenCode Go recusou a chave (HTTP 401)')
  })

  it('várias chaves em uso (OPE-179): confere cada uma e avisa a que foi recusada', async () => {
    mocks.pool = [{ id: 'key_a', name: 'Assinatura', apiKey: 'oc_sk_a' }, { id: 'key_b', name: 'Reserva', apiKey: 'oc_sk_b' }]
    mocks.verify.mockImplementation(async (_signal: AbortSignal, key?: { id: string }) => {
      if (key?.id === 'key_b') throw new AiProviderError('O OpenCode Go recusou a chave (HTTP 401)')
    })
    const result = await run()
    expect(result).toEqual({ status: 'warn', message: '1 de 2 chaves aceitas; falhou: “Reserva” (O OpenCode Go recusou a chave (HTTP 401))' })
    expect(mocks.verify).toHaveBeenCalledWith(expect.anything(), mocks.pool[1])
    expect(JSON.stringify(result)).not.toContain('oc_sk_')
  })
})

describe('teste por chave nos provedores de API key (OPE-179)', () => {
  it('Gemini com uma chave só não repete a conferência; com duas aceitas, segue normal', async () => {
    mocks.values = { apiKey: 'gm' }
    mocks.models.mockResolvedValue([{ id: 'gemini-x' }])
    mocks.pool = [{ id: 'key_a', name: 'A', apiKey: 'gm' }]
    const emit = vi.fn()
    expect(await testGemini({ emit, signal: new AbortController().signal })).toBe('API key válida; 1 modelo(s)')
    expect(mocks.listGemini).not.toHaveBeenCalled()

    mocks.pool = [{ id: 'key_a', name: 'A', apiKey: 'gm' }, { id: 'key_b', name: 'B', apiKey: 'gm2' }]
    mocks.listGemini.mockResolvedValue([])
    expect(await testGemini({ emit, signal: new AbortController().signal })).toBe('API key válida; 1 modelo(s)')
    expect(mocks.listGemini).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenCalledWith('success', 'Chave “B” aceita')
  })
})
