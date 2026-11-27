import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-190: teste de conexão do Command Code (lista os modelos e confere a chave, que o catálogo público não prova). */

const mocks = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  models: vi.fn(),
  verify: vi.fn(),
  pool: [] as { id: string; name: string; apiKey: string }[],
}))

vi.mock("@/lib/integrations/runtime", () => ({
  getIntegration: vi.fn(async () => ({ values: mocks.values })),
  isIntegrationConfigured: vi.fn(() => true),
}))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/catalog', () => ({ clearAiCatalogCache: vi.fn(), listAiAgents: vi.fn(), listAiModels: mocks.models }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/opencode', () => ({ getOpencodeInfo: vi.fn() }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/opencode-go', () => ({ verifyOpencodeGoKey: vi.fn() }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/command-code', () => ({ verifyCommandCodeKey: mocks.verify }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/api-keys', () => ({ getAiProviderKeyPool: async () => mocks.pool }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/gemini', () => ({ listGeminiModels: vi.fn() }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/anthropic', () => ({ listAnthropicModels: vi.fn() }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/openai', () => ({ listOpenaiModels: vi.fn() }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/deepseek', () => ({ listDeepseekModels: vi.fn() }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/jev', () => ({ listJevModels: vi.fn() }))

import { AiProviderError } from "@nandobfer/integracoes/modules/integrations/ia/ai/errors"
import { testCommandCode } from "@nandobfer/integracoes/modules/integrations/ia/features/ai/server/testers"

const run = () => testCommandCode({ emit: vi.fn(), signal: new AbortController().signal })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.values = { apiKey: 'user_x' }
  mocks.models.mockResolvedValue([{ id: 'claude-sonnet-5-5' }, { id: 'gpt-6-astra' }])
  mocks.verify.mockResolvedValue(undefined)
  mocks.pool = [{ id: 'key_a', name: 'Pessoal', apiKey: 'user_x' }]
})

describe('testCommandCode', () => {
  it('chave aceita: lista os modelos e confere a chave', async () => {
    expect(await run()).toBe('Chave aceita; 2 modelo(s)')
    expect(mocks.models).toHaveBeenCalledWith('command-code', expect.objectContaining({ fresh: true }))
    expect(mocks.verify).toHaveBeenCalledTimes(1)
  })

  it('sem chave: falha sem chamar o Command Code', async () => {
    mocks.values = {}
    await expect(run()).rejects.toThrow('Sem chave de API ativa: cadastre e ative uma chave do Studio do Command Code em Chaves de API')
    expect(mocks.models).not.toHaveBeenCalled()
  })

  it('chave recusada: falha com a mensagem do provedor mesmo com o catálogo respondendo', async () => {
    mocks.verify.mockRejectedValue(new AiProviderError('O Command Code recusou a chave (HTTP 401)'))
    await expect(run()).rejects.toThrow('O Command Code recusou a chave (HTTP 401)')
  })

  it('várias chaves em uso: confere cada uma e avisa a que foi recusada, sem expor segredos', async () => {
    mocks.pool = [{ id: 'key_a', name: 'Pessoal', apiKey: 'user_a' }, { id: 'key_b', name: 'Plano Go', apiKey: 'user_b' }]
    mocks.verify.mockImplementation(async (_signal: AbortSignal, key?: { id: string }) => {
      if (key?.id === 'key_b') throw new AiProviderError('O plano do Command Code não tem acesso à API (HTTP 403, upgrade_required)')
    })
    const result = await run()
    expect(result).toEqual({ status: 'warn', message: '1 de 2 chaves aceitas; falhou: “Plano Go” (O plano do Command Code não tem acesso à API (HTTP 403, upgrade_required))' })
    expect(JSON.stringify(result)).not.toContain('user_')
  })
})
