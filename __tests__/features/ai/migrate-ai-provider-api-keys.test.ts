import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findOne: vi.fn(), updateOne: vi.fn(), warn: vi.fn() }))
vi.mock('@/lib/db/models/Integration', () => ({ Integration: { findOne: (filter: { integrationId: string }) => ({ lean: () => mocks.findOne(filter.integrationId) }), updateOne: mocks.updateOne } }))
vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn() } }))

import { MIGRATED_API_KEY_NAME, migrateAiProviderApiKeys } from '@/lib/db/migrations/migrate-ai-provider-api-keys'

const box = { v: 1, iv: 'aXY=', tag: 'dGFn', ct: 'Y3Q=' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateOne.mockResolvedValue({ modifiedCount: 1 })
})

describe('migração da API key única para o chaveiro (OPE-155)', () => {
  it('copia a chave legada para "Chave principal" ativa, sem decifrar e SEM apagar o segredo legado', async () => {
    mocks.findOne.mockImplementation(async (id: string) => (id === 'ai_gemini' ? { secretValues: { apiKey: box }, updatedAt: new Date('2026-10-01'), updatedBy: 'local' } : null))
    await migrateAiProviderApiKeys()
    expect(mocks.updateOne).toHaveBeenCalledOnce()
    const [filter, update] = mocks.updateOne.mock.calls[0]!
    expect(filter).toEqual({ integrationId: 'ai_gemini', apiKeys: { $exists: false } })
    const item = update.$set.apiKeys[0]
    expect(item).toMatchObject({ name: MIGRATED_API_KEY_NAME, secret: box })
    expect(update.$set.activeApiKeyId).toBe(item.id)
    expect(JSON.stringify(update)).not.toContain('$unset')
    expect(Object.keys(update.$set)).toEqual(['apiKeys', 'activeApiKeyId'])
  })

  it('OpenCode Go (OPE-156): a chave única legada vira "Chave principal" ativa, junto dos demais provedores', async () => {
    mocks.findOne.mockImplementation(async (id: string) => (id === 'ai_opencode_go' || id === 'ai_deepseek' ? { secretValues: { apiKey: box } } : id === 'ai_opencode' ? { secretValues: { password: box } } : null))
    await migrateAiProviderApiKeys()
    const touched = mocks.updateOne.mock.calls.map(([filter]) => filter.integrationId).sort()
    expect(touched).toEqual(['ai_deepseek', 'ai_opencode_go'])
    const [, update] = mocks.updateOne.mock.calls.find(([filter]) => filter.integrationId === 'ai_opencode_go')!
    expect(update.$set.apiKeys[0]).toMatchObject({ name: MIGRATED_API_KEY_NAME, secret: box })
    expect(update.$set.activeApiKeyId).toBe(update.$set.apiKeys[0].id)
    expect(mocks.findOne).not.toHaveBeenCalledWith('ai_opencode')
  })

  it('idempotente: documento com chaveiro, sem chave ou com segredo limpo não é tocado', async () => {
    mocks.findOne.mockImplementation(async (id: string) => {
      if (id === 'ai_gemini') return { secretValues: { apiKey: box }, apiKeys: [] }
      if (id === 'ai_openai') return { secretValues: { apiKey: null } }
      if (id === 'ai_jev') return { secretValues: {} }
      return null
    })
    await migrateAiProviderApiKeys()
    expect(mocks.updateOne).not.toHaveBeenCalled()
    expect(mocks.warn).not.toHaveBeenCalled()
  })
})
