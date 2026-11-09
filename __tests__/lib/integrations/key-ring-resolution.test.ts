import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import { encryptSecret } from '@/lib/crypto/secretBox'
import { getIntegrationDef } from '@/lib/integrations/catalog'
import { activeApiKeyOf, buildResolvedIntegration, isIntegrationConfigured } from '@/lib/integrations/config'
import { KEY_RING_INTEGRATION_IDS } from '@/lib/integrations/key-ring'
import type { StoredIntegration } from '@/lib/integrations/store'

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
  it('vale para Gemini, Anthropic, OpenAI, DeepSeek e JEV; nunca para o OpenCode', () => {
    expect([...KEY_RING_INTEGRATION_IDS].sort()).toEqual(['ai_anthropic', 'ai_deepseek', 'ai_gemini', 'ai_jev', 'ai_openai'])
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
})
