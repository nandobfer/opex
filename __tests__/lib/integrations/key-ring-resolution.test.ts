import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import { encryptSecret } from '@/lib/crypto/secretBox'
import { getIntegrationDef } from "@/features/integrations/registry/definitions"
import { activeApiKeyOf, buildResolvedIntegration, isIntegrationConfigured, selectedApiKeysOf } from "@nandobfer/integracoes/modules/server/config"
import { KEY_RING_INTEGRATION_IDS } from "@/features/integrations/registry/definitions"
import type { StoredIntegration } from "@nandobfer/integracoes/modules/server/store"

/** Chaveiro dos provedores de IA (OPE-155): a API key efetiva é a da chave ATIVA. */

const saved = process.env.INTEGRATIONS_ENCRYPTION_KEY
beforeEach(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
})
afterEach(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = saved
})

const now = new Date()
const key = (id: string, value: string) => ({ id, name: id, secret: encryptSecret(value), createdAt: now, updatedAt: now })
const stored = (overrides: Partial<StoredIntegration>): StoredIntegration => ({ integrationId: 'ai_gemini', environment: 'externo', debugMode: false, publicValues: {}, secretValues: {}, ...overrides })

describe('chaveiro das integrações de IA', () => {
  it('vale para Gemini, Anthropic, OpenAI, DeepSeek, OpenCode Go (OPE-156) e JEV; nunca para o OpenCode no host', () => {
    expect([...KEY_RING_INTEGRATION_IDS].sort()).toEqual(['ai_anthropic', 'ai_command_code', 'ai_deepseek', 'ai_gemini', 'ai_jev', 'ai_openai', 'ai_opencode_go'])
    expect(KEY_RING_INTEGRATION_IDS).not.toContain('ai_opencode')
  })

  it('OpenCode Go (OPE-156): a chave em uso vira a API key; só a chave legada não configura o provedor', () => {
    const def = getIntegrationDef('ai_opencode_go')
    const keys = [key('key_a', 'oc_sk_a'), key('key_b', 'oc_sk_b')]
    const resolved = buildResolvedIntegration<'ai_opencode_go'>(def, stored({ integrationId: 'ai_opencode_go', apiKeys: keys, activeApiKeyId: 'key_b' }))
    expect(resolved.values.apiKey).toBe('oc_sk_b')
    expect(isIntegrationConfigured(def, resolved)).toBe(true)
    const legacyOnly = buildResolvedIntegration<'ai_opencode_go'>(def, stored({ integrationId: 'ai_opencode_go', secretValues: { apiKey: encryptSecret('oc_sk_legado') }, apiKeys: [], activeApiKeyId: null }))
    expect(legacyOnly.values.apiKey).toBeUndefined()
    expect(isIntegrationConfigured(def, legacyOnly)).toBe(false)
  })

  it('a chave ativa vira a API key; trocar a ativa muda o version (cache do catálogo)', () => {
    const def = getIntegrationDef('ai_gemini')
    const keys = [key('key_a', 'gm-a'), key('key_b', 'gm-b')]
    const first = buildResolvedIntegration<'ai_gemini'>(def, stored({ apiKeys: keys, activeApiKeyId: 'key_a' }))
    const second = buildResolvedIntegration<'ai_gemini'>(def, stored({ apiKeys: keys, activeApiKeyId: 'key_b' }))
    expect(first.values.apiKey).toBe('gm-a')
    expect(second.values.apiKey).toBe('gm-b')
    expect(first.secretSources.apiKey).toBe('db')
    expect(first.version).not.toBe(second.version)
    expect(isIntegrationConfigured(def, first)).toBe(true)
  })

  it('sem chave ativa o provedor não está configurado, mesmo com o segredo legado da migração', () => {
    const def = getIntegrationDef('ai_openai')
    const legacy = stored({ integrationId: 'ai_openai', secretValues: { apiKey: encryptSecret('sk-legado') }, apiKeys: [key('key_a', 'sk-a')], activeApiKeyId: null })
    const resolved = buildResolvedIntegration<'ai_openai'>(def, legacy)
    expect(resolved.values.apiKey).toBeUndefined()
    expect(resolved.secretSources.apiKey).toBe('none')
    expect(isIntegrationConfigured(def, resolved)).toBe(false)
  })

  it('id ativo que não existe mais não resolve chave', () => {
    expect(activeApiKeyOf({ apiKeys: [key('key_a', 'x')], activeApiKeyId: 'key_z' })).toBeNull()
    expect(activeApiKeyOf(null)).toBeNull()
  })

  describe('chaves em uso no rodízio (OPE-179)', () => {
    const at = (id: string, ms: number) => ({ ...key(id, id), createdAt: new Date(ms) })
    let keys: ReturnType<typeof at>[] = []
    beforeEach(() => {
      keys = [at('key_c', 3), at('key_a', 1), at('key_b', 2)]
    })
    const ids = (list: { id: string }[]) => list.map((item) => item.id)

    it('sem o campo (documentos de antes), o rodízio é só a principal', () => {
      expect(ids(selectedApiKeysOf({ apiKeys: keys, activeApiKeyId: 'key_b' }))).toEqual(['key_b'])
    })

    it('ordem estável por criação; ids removidos saem; a principal sempre entra (a versão antiga só troca `activeApiKeyId`)', () => {
      expect(ids(selectedApiKeysOf({ apiKeys: keys, activeApiKeyId: 'key_a', selectedApiKeyIds: ['key_c', 'key_a', 'key_removida'] }))).toEqual(['key_a', 'key_c'])
      expect(ids(selectedApiKeysOf({ apiKeys: keys, activeApiKeyId: 'key_b', selectedApiKeyIds: ['key_a', 'key_c'] }))).toEqual(['key_a', 'key_b', 'key_c'])
    })

    it('sem principal válida não há chave em uso (provedor não configurado), mesmo com a lista gravada', () => {
      expect(selectedApiKeysOf({ apiKeys: keys, activeApiKeyId: null, selectedApiKeyIds: ['key_a'] })).toEqual([])
      expect(selectedApiKeysOf({ apiKeys: keys, activeApiKeyId: 'key_z', selectedApiKeyIds: ['key_a'] })).toEqual([])
      expect(selectedApiKeysOf(null)).toEqual([])
    })

    it('a API key resolvida da integração continua sendo a principal, com várias em uso', () => {
      const def = getIntegrationDef('ai_gemini')
      const resolved = buildResolvedIntegration<'ai_gemini'>(def, stored({ apiKeys: keys, activeApiKeyId: 'key_b', selectedApiKeyIds: ['key_a', 'key_b', 'key_c'] }))
      expect(resolved.values.apiKey).toBe('key_b')
    })
  })
})
