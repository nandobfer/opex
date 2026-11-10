import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'crypto'

/** Chaveiro dos provedores de IA (OPE-155): regras do serviço sobre um documento de integração em memória. */

type Doc = { integrationId: string; apiKeys?: Record<string, unknown>[]; activeApiKeyId?: string | null; [key: string]: unknown }

const mocks = vi.hoisted(() => ({
  docs: new Map<string, Doc>(),
  audit: vi.fn(),
  publish: vi.fn(),
  sync: vi.fn(async (...args: unknown[]) => void args),
  test: vi.fn(async (...args: unknown[]) => ({ ok: true, args })),
  clearCatalog: vi.fn(),
  resetProbes: vi.fn(),
  clearGoCatalog: vi.fn(),
  invalidate: vi.fn(),
}))

function applyUpdate(doc: Doc, update: Record<string, unknown>, keyId?: string) {
  const keys = (doc.apiKeys ??= [])
  for (const [path, value] of Object.entries((update.$set as Record<string, unknown>) ?? {})) {
    if (path.startsWith('apiKeys.$.')) {
      const item = keys.find((candidate) => candidate.id === keyId)!
      item[path.slice('apiKeys.$.'.length)] = value
    } else doc[path] = value
  }
  if (update.$push) keys.push((update.$push as { apiKeys: Record<string, unknown> }).apiKeys)
  if (update.$pull) {
    const id = ((update.$pull as { apiKeys: { id: string } }).apiKeys).id
    doc.apiKeys = keys.filter((candidate) => candidate.id !== id)
  }
}

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn(),
  recordAudit: mocks.audit,
  AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' },
  createAuditContext: (userId: string) => ({ userId }),
}))
vi.mock('@/lib/db/models/Integration', () => {
  function Integration(this: Record<string, unknown>, data: Doc) {
    Object.assign(this, data)
    this.set = vi.fn()
    this.save = async () => void mocks.docs.set(data.integrationId, { ...data })
  }
  Object.assign(Integration, {
    findOne: (filter: { integrationId: string }) => ({ select: () => ({ lean: async () => structuredClone(mocks.docs.get(filter.integrationId) ?? null) }) }),
    exists: async (filter: { integrationId: string }) => (mocks.docs.has(filter.integrationId) ? { _id: 1 } : null),
    updateOne: async (filter: { integrationId: string; 'apiKeys.id'?: string }, update: Record<string, unknown>) => {
      const doc = mocks.docs.get(filter.integrationId)
      if (doc) applyUpdate(doc, update, filter['apiKeys.id'])
      return { modifiedCount: doc ? 1 : 0 }
    },
  })
  return { Integration }
})
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/lib/after-response', () => ({ runAfterResponse: (_label: string, task: () => Promise<unknown>) => void task() }))
vi.mock('@/lib/integrations/store', () => ({ invalidateStoredIntegrations: mocks.invalidate, loadStoredIntegration: vi.fn() }))
vi.mock('@/lib/ai/catalog', () => ({ clearAiCatalogCache: mocks.clearCatalog }))
vi.mock('@/lib/ai/connection', () => ({ resetAiConnectionProbes: mocks.resetProbes }))
vi.mock('@/lib/ai/opencode-go', () => ({ clearOpencodeGoCatalogCache: mocks.clearGoCatalog }))
vi.mock('@/features/integrations/services/integration-test-runner', () => ({ runIntegrationTest: mocks.test }))
vi.mock('@/features/engramind/server/ai-source', () => ({ syncEngramindProviderKey: mocks.sync }))

import { DomainError } from '@/lib/api/route'
import { decryptSecret, type EncryptedSecret } from '@/lib/crypto/secretBox'
import { activateAiApiKey, createAiApiKey, keyRingProvider, listAiApiKeys, removeAiApiKey, updateAiApiKey } from '@/features/ai/server/api-keys'

const saved = process.env.INTEGRATIONS_ENCRYPTION_KEY
const actor = 'local'
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.docs.clear()
  process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
})
afterEach(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = saved
})

describe('chaveiro dos provedores de IA', () => {
  it('a primeira chave entra ativa, cifrada; a segunda não troca a em uso; nada de segredo no DTO, na auditoria ou no evento', async () => {
    const first = await createAiApiKey('gemini', { name: 'Pessoal', secret: 'gm-pessoal' }, actor)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ name: 'Pessoal', active: true })
    const stored = mocks.docs.get('ai_gemini')!
    expect(decryptSecret(stored.apiKeys![0]!.secret as EncryptedSecret)).toBe('gm-pessoal')
    expect(stored.activeApiKeyId).toBe(first[0]!.id)

    const second = await createAiApiKey('gemini', { name: 'Empresa', secret: 'gm-empresa' }, actor)
    expect(second.map((key) => [key.name, key.active])).toEqual([['Pessoal', true], ['Empresa', false]])

    const leaked = JSON.stringify([first, second, mocks.audit.mock.calls, mocks.publish.mock.calls])
    expect(leaked).not.toContain('gm-pessoal')
    expect(leaked).not.toContain('gm-empresa')
    expect(mocks.publish).toHaveBeenCalledWith('ai-provider-keys-updated', { provider: 'gemini' })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'ChaveApiIA', acao: 'CRIAR' }))
  })

  it('a chave efetiva nova testa o provedor de novo e reenvia ao Engramind; a não ativa não', async () => {
    await createAiApiKey('openai', { name: 'Pessoal', secret: 'sk-1' }, actor)
    await flush()
    expect(mocks.sync).toHaveBeenCalledWith('ai_openai')
    expect(mocks.test).toHaveBeenCalledWith('ai_openai', { source: 'scheduler' })
    expect(mocks.clearCatalog).toHaveBeenCalled()

    vi.clearAllMocks()
    const keys = await createAiApiKey('openai', { name: 'Empresa', secret: 'sk-2' }, actor)
    await flush()
    expect(mocks.sync).not.toHaveBeenCalled()

    await activateAiApiKey('openai', keys[1]!.id, actor)
    await flush()
    expect(mocks.docs.get('ai_openai')!.activeApiKeyId).toBe(keys[1]!.id)
    expect(mocks.sync).toHaveBeenCalledWith('ai_openai')
  })

  it('o JEV troca de chave sem alimentar o Engramind', async () => {
    await createAiApiKey('jev', { name: 'TypeSafe', secret: 'ts-1' }, actor)
    await flush()
    expect(mocks.test).toHaveBeenCalledWith('ai_jev', { source: 'scheduler' })
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('OpenCode Go (OPE-156): várias chaves, troca da em uso limpa o catálogo do Go e testa de novo, sem alimentar o Engramind', async () => {
    const [main] = await createAiApiKey('opencode-go', { name: 'Assinatura', secret: 'oc_sk_1' }, actor)
    const keys = await createAiApiKey('opencode-go', { name: 'Reserva', secret: 'oc_sk_2' }, actor)
    await flush()
    vi.clearAllMocks()
    const reserve = keys.find((key) => key.name === 'Reserva')!
    await expect(removeAiApiKey('opencode-go', main!.id, actor)).rejects.toMatchObject({ status: 409, code: 'AI_API_KEY_ACTIVE' })

    const after = await activateAiApiKey('opencode-go', reserve.id, actor)
    await flush()
    expect(after.map((key) => [key.name, key.active])).toEqual([['Reserva', true], ['Assinatura', false]])
    expect(mocks.docs.get('ai_opencode_go')!.activeApiKeyId).toBe(reserve.id)
    expect(mocks.clearGoCatalog).toHaveBeenCalledOnce()
    expect(mocks.clearCatalog).toHaveBeenCalled()
    expect(mocks.resetProbes).toHaveBeenCalled()
    expect(mocks.test).toHaveBeenCalledWith('ai_opencode_go', { source: 'scheduler' })
    expect(mocks.publish).toHaveBeenCalledWith('ai-provider-keys-updated', { provider: 'opencode-go' })
    expect(mocks.sync).not.toHaveBeenCalled()
    expect(JSON.stringify([after, mocks.audit.mock.calls, mocks.publish.mock.calls])).not.toContain('oc_sk_')
  })

  it('o catálogo do Go só é limpo na troca de chave do próprio Go', async () => {
    await createAiApiKey('gemini', { name: 'A', secret: 'gm' }, actor)
    await flush()
    expect(mocks.clearGoCatalog).not.toHaveBeenCalled()
  })

  it('nome repetido (sem diferenciar maiúsculas) é recusado', async () => {
    await createAiApiKey('anthropic', { name: 'Pessoal', secret: 'a' }, actor)
    await expect(createAiApiKey('anthropic', { name: ' pessoal ', secret: 'b' }, actor)).rejects.toMatchObject({ status: 409, code: 'AI_API_KEY_NAME_TAKEN' })
  })

  it('renomear e substituir o segredo mantém o id; substituir a ativa reenvia, renomear não', async () => {
    const [key] = await createAiApiKey('deepseek', { name: 'Pessoal', secret: 'ds-1' }, actor)
    await flush()
    vi.clearAllMocks()

    const renamed = await updateAiApiKey('deepseek', key!.id, { name: 'Conta principal' }, actor)
    await flush()
    expect(renamed[0]).toMatchObject({ id: key!.id, name: 'Conta principal', active: true })
    expect(mocks.sync).not.toHaveBeenCalled()

    await updateAiApiKey('deepseek', key!.id, { secret: 'ds-2' }, actor)
    await flush()
    expect(decryptSecret(mocks.docs.get('ai_deepseek')!.apiKeys![0]!.secret as EncryptedSecret)).toBe('ds-2')
    expect(mocks.sync).toHaveBeenCalledWith('ai_deepseek')
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('ds-2')
  })

  it('remover a ativa com outras chaves é recusado; a única ativa sai e deixa o provedor sem chave', async () => {
    const [a] = await createAiApiKey('gemini', { name: 'A', secret: 'a' }, actor)
    const keys = await createAiApiKey('gemini', { name: 'B', secret: 'b' }, actor)
    const b = keys.find((key) => key.name === 'B')!
    await expect(removeAiApiKey('gemini', a!.id, actor)).rejects.toMatchObject({ status: 409, code: 'AI_API_KEY_ACTIVE' })

    expect(await removeAiApiKey('gemini', b.id, actor)).toHaveLength(1)
    expect(mocks.docs.get('ai_gemini')!.activeApiKeyId).toBe(a!.id)

    vi.clearAllMocks()
    expect(await removeAiApiKey('gemini', a!.id, actor)).toEqual([])
    await flush()
    expect(mocks.docs.get('ai_gemini')!.activeApiKeyId).toBeNull()
    // Sem chave em uso não há o que testar; o Engramind marca a chave como apagada.
    expect(mocks.test).not.toHaveBeenCalled()
    expect(mocks.sync).toHaveBeenCalledWith('ai_gemini')
  })

  it('chave inexistente responde 404; provedor sem chaveiro (OpenCode) também', async () => {
    await expect(activateAiApiKey('gemini', 'key_000000000000000000', actor)).rejects.toMatchObject({ status: 404 })
    expect(() => keyRingProvider('opencode')).toThrow(DomainError)
    expect(keyRingProvider('jev')).toBe('jev')
    expect(keyRingProvider('opencode-go')).toBe('opencode-go')
  })

  it('sem a chave de criptografia, recusa gravar com 409 acionável', async () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
    await expect(createAiApiKey('gemini', { name: 'A', secret: 'a' }, actor)).rejects.toMatchObject({ status: 409 })
    expect(await listAiApiKeys('gemini')).toEqual([])
  })
})
