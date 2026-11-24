import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'crypto'

/** Chaveiro dos provedores de IA (OPE-155/OPE-179): regras do serviço sobre um documento de integração em memória. */

type Doc = { integrationId: string; apiKeys?: Record<string, unknown>[]; activeApiKeyId?: string | null; selectedApiKeyIds?: string[]; [key: string]: unknown }

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
  if (update.$addToSet) {
    const values = (update.$addToSet as { selectedApiKeyIds: { $each: string[] } }).selectedApiKeyIds.$each
    const current = (doc.selectedApiKeyIds ??= [])
    for (const value of values) if (!current.includes(value)) current.push(value)
  }
  if (update.$pull) {
    const pull = update.$pull as { apiKeys?: { id: string }; selectedApiKeyIds?: string }
    if (pull.apiKeys) doc.apiKeys = keys.filter((candidate) => candidate.id !== pull.apiKeys!.id)
    if (pull.selectedApiKeyIds && doc.selectedApiKeyIds) doc.selectedApiKeyIds = doc.selectedApiKeyIds.filter((id) => id !== pull.selectedApiKeyIds)
  }
}

/** Filtro do `updateOne` como o Mongo: a chave precisa existir e `activeApiKeyId` (valor, `null` = ausente, ou `$ne`) casar. */
function matches(doc: Doc | undefined, filter: Record<string, unknown>): boolean {
  if (!doc) return false
  if (filter['apiKeys.id'] && !doc.apiKeys?.some((candidate) => candidate.id === filter['apiKeys.id'])) return false
  if ('activeApiKeyId' in filter) {
    const expected = filter.activeApiKeyId as string | null | { $ne: string }
    const actual = doc.activeApiKeyId ?? null
    if (expected !== null && typeof expected === 'object') return actual !== expected.$ne
    return actual === expected
  }
  return true
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
      // Entrega a gravação na próxima volta do loop, como o banco: leituras concorrentes acontecem antes.
      await new Promise((resolve) => setTimeout(resolve, 0))
      const doc = mocks.docs.get(filter.integrationId)
      const matched = matches(doc, filter)
      if (matched) applyUpdate(doc!, update, filter['apiKeys.id'])
      return { matchedCount: matched ? 1 : 0, modifiedCount: matched ? 1 : 0 }
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
import { createAiApiKey, keyRingProvider, listAiApiKeys, makePrimaryAiApiKey, removeAiApiKey, setAiApiKeySelected, updateAiApiKey } from '@/features/ai/server/api-keys'

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
    expect(first[0]).toMatchObject({ name: 'Pessoal', active: true, primary: true })
    const stored = mocks.docs.get('ai_gemini')!
    expect(decryptSecret(stored.apiKeys![0]!.secret as EncryptedSecret)).toBe('gm-pessoal')
    expect(stored.activeApiKeyId).toBe(first[0]!.id)
    expect(stored.selectedApiKeyIds).toEqual([first[0]!.id])

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

    await makePrimaryAiApiKey('openai', keys[1]!.id, actor)
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
    await expect(removeAiApiKey('opencode-go', main!.id, actor)).rejects.toMatchObject({ status: 409, code: 'AI_API_KEY_PRIMARY' })

    const after = await makePrimaryAiApiKey('opencode-go', reserve.id, actor)
    await flush()
    // A principal anterior continua em uso (rodízio); a nova principal entra em uso.
    expect(after.map((key) => [key.name, key.active, key.primary])).toEqual([['Reserva', true, true], ['Assinatura', true, false]])
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

  it('remover a principal com outras chaves é recusado; a única sai e deixa o provedor sem chave', async () => {
    const [a] = await createAiApiKey('gemini', { name: 'A', secret: 'a' }, actor)
    const keys = await createAiApiKey('gemini', { name: 'B', secret: 'b' }, actor)
    const b = keys.find((key) => key.name === 'B')!
    await expect(removeAiApiKey('gemini', a!.id, actor)).rejects.toMatchObject({ status: 409, code: 'AI_API_KEY_PRIMARY' })

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
    await expect(makePrimaryAiApiKey('gemini', 'key_000000000000000000', actor)).rejects.toMatchObject({ status: 404 })
    await expect(setAiApiKeySelected('gemini', 'key_000000000000000000', { selected: true }, actor)).rejects.toMatchObject({ status: 404 })
    expect(() => keyRingProvider('opencode')).toThrow(DomainError)
    expect(keyRingProvider('jev')).toBe('jev')
    expect(keyRingProvider('opencode-go')).toBe('opencode-go')
  })

  describe('várias chaves em uso (OPE-179)', () => {
    async function threeKeys() {
      await createAiApiKey('anthropic', { name: 'A', secret: 'sk-a' }, actor)
      await createAiApiKey('anthropic', { name: 'B', secret: 'sk-b' }, actor)
      const keys = await createAiApiKey('anthropic', { name: 'C', secret: 'sk-c' }, actor)
      await flush()
      vi.clearAllMocks()
      const byName = (name: string) => keys.find((key) => key.name === name)!
      return { a: byName('A'), b: byName('B'), c: byName('C') }
    }

    it('pôr em uso entra no rodízio e testa o provedor de novo, sem reenviar ao Engramind', async () => {
      const { a, b } = await threeKeys()
      const list = await setAiApiKeySelected('anthropic', b.id, { selected: true }, actor)
      await flush()
      expect(mocks.docs.get('ai_anthropic')!.selectedApiKeyIds).toEqual([a.id, b.id])
      expect(list.map((key) => [key.name, key.active, key.primary])).toEqual([['A', true, true], ['B', true, false], ['C', false, false]])
      expect(mocks.test).toHaveBeenCalledWith('ai_anthropic', { source: 'scheduler' })
      expect(mocks.sync).not.toHaveBeenCalled()
      expect(mocks.clearCatalog).not.toHaveBeenCalled()
      expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'ATUALIZAR', antes: expect.objectContaining({ emUso: false }), depois: expect.objectContaining({ emUso: true }) }))
      expect(mocks.publish).toHaveBeenCalledWith('ai-provider-keys-updated', { provider: 'anthropic' })
    })

    it('tirar de uso sai do rodízio; a principal não sai (409) e repetir o estado não grava nada', async () => {
      const { a, b } = await threeKeys()
      await setAiApiKeySelected('anthropic', b.id, { selected: true }, actor)
      const list = await setAiApiKeySelected('anthropic', b.id, { selected: false }, actor)
      expect(list.find((key) => key.id === b.id)).toMatchObject({ active: false, primary: false })
      expect(mocks.docs.get('ai_anthropic')!.selectedApiKeyIds).toEqual([a.id])

      await expect(setAiApiKeySelected('anthropic', a.id, { selected: false }, actor)).rejects.toMatchObject({ status: 409, code: 'AI_API_KEY_PRIMARY' })
      vi.clearAllMocks()
      await setAiApiKeySelected('anthropic', b.id, { selected: false }, actor)
      expect(mocks.audit).not.toHaveBeenCalled()
      expect(mocks.publish).not.toHaveBeenCalled()
    })

    it('tornar principal põe a chave em uso e reenvia ao Engramind', async () => {
      const { a, c } = await threeKeys()
      const list = await makePrimaryAiApiKey('anthropic', c.id, actor)
      await flush()
      const doc = mocks.docs.get('ai_anthropic')!
      expect(doc.activeApiKeyId).toBe(c.id)
      expect(doc.selectedApiKeyIds).toEqual([a.id, c.id])
      expect(list[0]).toMatchObject({ name: 'C', primary: true, active: true })
      expect(mocks.sync).toHaveBeenCalledWith('ai_anthropic')
      expect(mocks.clearCatalog).toHaveBeenCalled()
    })

    it('remover uma chave em uso que não é a principal a tira do rodízio', async () => {
      const { a, b } = await threeKeys()
      await setAiApiKeySelected('anthropic', b.id, { selected: true }, actor)
      await flush()
      vi.clearAllMocks()
      await removeAiApiKey('anthropic', b.id, actor)
      await flush()
      expect(mocks.docs.get('ai_anthropic')!.selectedApiKeyIds).toEqual([a.id])
      expect(mocks.test).toHaveBeenCalledWith('ai_anthropic', { source: 'scheduler' })
      expect(mocks.sync).not.toHaveBeenCalled()
    })

    it('sem principal (versão antiga removeu tudo), a chave posta em uso vira a principal', async () => {
      const { a, b } = await threeKeys()
      mocks.docs.get('ai_anthropic')!.activeApiKeyId = 'key_removida_000000000'
      const list = await setAiApiKeySelected('anthropic', b.id, { selected: true }, actor)
      await flush()
      expect(mocks.docs.get('ai_anthropic')!.activeApiKeyId).toBe(b.id)
      expect(list.find((key) => key.id === b.id)).toMatchObject({ active: true, primary: true })
      expect(list.find((key) => key.id === a.id)).toMatchObject({ active: false, primary: false })
      expect(mocks.sync).toHaveBeenCalledWith('ai_anthropic')
    })

    it('documento sem `selectedApiKeyIds` (produção antiga): só a principal está em uso', async () => {
      const { a } = await threeKeys()
      delete mocks.docs.get('ai_anthropic')!.selectedApiKeyIds
      const list = await listAiApiKeys('anthropic')
      expect(list.filter((key) => key.active).map((key) => key.id)).toEqual([a.id])
    })

    it('cliques concorrentes em chaves diferentes não se sobrescrevem: as duas ficam em uso', async () => {
      const { a, b, c } = await threeKeys()
      await Promise.all([setAiApiKeySelected('anthropic', b.id, { selected: true }, actor), setAiApiKeySelected('anthropic', c.id, { selected: true }, actor)])
      expect([...mocks.docs.get('ai_anthropic')!.selectedApiKeyIds!].sort()).toEqual([a.id, b.id, c.id].sort())
      const list = await listAiApiKeys('anthropic')
      expect(list.every((key) => key.active)).toBe(true)

      await Promise.all([setAiApiKeySelected('anthropic', b.id, { selected: false }, actor), makePrimaryAiApiKey('anthropic', c.id, actor)])
      const doc = mocks.docs.get('ai_anthropic')!
      expect(doc.activeApiKeyId).toBe(c.id)
      expect([...doc.selectedApiKeyIds!].sort()).toEqual([a.id, c.id].sort())
    })

    it('documento sem o campo: pôr uma chave em uso grava também a principal; tornar principal mantém a anterior em uso', async () => {
      const { a, b, c } = await threeKeys()
      delete mocks.docs.get('ai_anthropic')!.selectedApiKeyIds
      await setAiApiKeySelected('anthropic', b.id, { selected: true }, actor)
      expect(mocks.docs.get('ai_anthropic')!.selectedApiKeyIds).toEqual([a.id, b.id])

      delete mocks.docs.get('ai_anthropic')!.selectedApiKeyIds
      await makePrimaryAiApiKey('anthropic', c.id, actor)
      expect(mocks.docs.get('ai_anthropic')!.selectedApiKeyIds).toEqual([a.id, c.id])
    })

    it('chave removida entre a leitura e a gravação: 404, sem auditoria nem evento', async () => {
      const { b } = await threeKeys()
      // O timer dispara depois da leitura (microtarefas) e antes da gravação (o updateOne espera um timer).
      setTimeout(() => {
        const doc = mocks.docs.get('ai_anthropic')!
        doc.apiKeys = doc.apiKeys!.filter((candidate) => candidate.id !== b.id)
      }, 0)
      const pending = setAiApiKeySelected('anthropic', b.id, { selected: true }, actor)
      await expect(pending).rejects.toMatchObject({ status: 404, code: 'AI_API_KEY_NOT_FOUND' })
      expect(mocks.audit).not.toHaveBeenCalled()
      expect(mocks.publish).not.toHaveBeenCalled()
    })

    it('selecionar valida o corpo', async () => {
      const { b } = await threeKeys()
      await expect(setAiApiKeySelected('anthropic', b.id, { selected: 'sim' }, actor)).rejects.toThrow()
    })
  })

  it('sem a chave de criptografia, recusa gravar com 409 acionável', async () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
    await expect(createAiApiKey('gemini', { name: 'A', secret: 'a' }, actor)).rejects.toMatchObject({ status: 409 })
    expect(await listAiApiKeys('gemini')).toEqual([])
  })
})
