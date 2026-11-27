import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'crypto'

const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock("@nandobfer/integracoes/modules/server/store", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ loadStoredIntegration: mocks.load }))()) as Record<string, unknown>) }))

import { encryptSecret } from '@/lib/crypto/secretBox'
import { getAiProviderKeyById } from "@nandobfer/integracoes/modules/integrations/ia/ai/api-keys"
import { opencodeGoMonthlyAllowances } from "@nandobfer/integracoes/modules/integrations/ia/ai/opencode-go-models"

/** Peças da assinatura OpenCode Go (OPE-167) fora da feature: cota por modelo do catálogo e chave do chaveiro por id. */

const saved = process.env.INTEGRATIONS_ENCRYPTION_KEY
beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
})
afterEach(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = saved
})

describe('opencodeGoMonthlyAllowances', () => {
  it('lê a cota mensal do plano e deixa nulos os gratuitos e os fora do plano', () => {
    const allowances = opencodeGoMonthlyAllowances(
      [
        { id: 'deepseek-v4.1-flash', go: { monthly_usage: { go: 100, 'go-plus': 200 } } },
        { id: 'glm-5.3', go: { monthly_usage: { go: 15 } } },
        { id: 'beam-free', go: { monthly_usage: null } },
        { id: 'sem-go' },
      ],
      'go',
    )
    expect([...allowances]).toEqual([['deepseek-v4.1-flash', 100], ['glm-5.3', 15], ['beam-free', null], ['sem-go', null]])
    expect(opencodeGoMonthlyAllowances([{ id: 'deepseek-v4.1-flash', go: { monthly_usage: { go: 100, 'go-plus': 200 } } }], 'go-plus').get('deepseek-v4.1-flash')).toBe(200)
  })
})

describe('getAiProviderKeyById', () => {
  const now = new Date()
  const key = (id: string, value: string) => ({ id, name: `Chave ${id}`, secret: encryptSecret(value), createdAt: now, updatedAt: now })

  it('decifra a chave pedida mesmo quando não é a em uso', async () => {
    mocks.load.mockResolvedValue({ integrationId: 'ai_opencode_go', apiKeys: [key('key_a', 'oc_sk_a'), key('key_b', 'oc_sk_b')], activeApiKeyId: 'key_a' })
    expect(await getAiProviderKeyById('ai_opencode_go', 'key_b')).toEqual({ id: 'key_b', name: 'Chave key_b', apiKey: 'oc_sk_b' })
    expect(mocks.load).toHaveBeenCalledWith('ai_opencode_go')
  })

  it('id inexistente ou sem chaveiro devolve null', async () => {
    mocks.load.mockResolvedValue({ integrationId: 'ai_opencode_go', apiKeys: [key('key_a', 'oc_sk_a')] })
    expect(await getAiProviderKeyById('ai_opencode_go', 'key_x')).toBeNull()
    mocks.load.mockResolvedValue(null)
    expect(await getAiProviderKeyById('ai_opencode_go', 'key_a')).toBeNull()
  })
})
