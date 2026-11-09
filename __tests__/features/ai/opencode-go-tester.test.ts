import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-154: teste de conexão do OpenCode Go (lista os modelos e confere a chave, que a lista pública não prova). */

const mocks = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  models: vi.fn(),
  verify: vi.fn(),
}))

vi.mock('@/lib/integrations/config', () => ({
  getIntegration: vi.fn(async () => ({ values: mocks.values })),
  isIntegrationConfigured: vi.fn(() => true),
}))
vi.mock('@/lib/ai/catalog', () => ({ clearAiCatalogCache: vi.fn(), listAiAgents: vi.fn(), listAiModels: mocks.models }))
vi.mock('@/lib/ai/opencode', () => ({ getOpencodeInfo: vi.fn() }))
vi.mock('@/lib/ai/opencode-go', () => ({ verifyOpencodeGoKey: mocks.verify }))

import { AiProviderError } from '@/lib/ai/errors'
import { testOpencodeGo } from '@/features/ai/server/testers'

const run = () => testOpencodeGo({ emit: vi.fn(), signal: new AbortController().signal })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.values = { apiKey: 'oc_sk_x' }
  mocks.models.mockResolvedValue([{ id: 'deepseek-v4.1-flash' }, { id: 'deepseek-v4-pro' }])
  mocks.verify.mockResolvedValue(undefined)
})

describe('testOpencodeGo', () => {
  it('chave aceita: lista os modelos do Go e confere a chave', async () => {
    expect(await run()).toBe('Chave aceita; 2 modelo(s)')
    expect(mocks.models).toHaveBeenCalledWith('opencode-go', expect.objectContaining({ fresh: true }))
    expect(mocks.verify).toHaveBeenCalledTimes(1)
  })

  it('sem chave: falha sem chamar o Go', async () => {
    mocks.values = {}
    await expect(run()).rejects.toThrow('Sem chave: cadastre a chave oc_sk_… do OpenCode Go em Campos privados')
    expect(mocks.models).not.toHaveBeenCalled()
  })

  it('chave recusada: falha com a mensagem do provedor mesmo com a lista de modelos respondendo', async () => {
    mocks.verify.mockRejectedValue(new AiProviderError('O OpenCode Go recusou a chave (HTTP 401)'))
    await expect(run()).rejects.toThrow('O OpenCode Go recusou a chave (HTTP 401)')
  })
})
