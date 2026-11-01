import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-104: etapas da migração de memórias antes da importação — backup (hash estável, só leitura na
 * coleção antiga, decisões preservadas), curador (exige backup, bloco que falha ou não responde vira
 * revisar_dono), compactação com tempo máximo, snapshot com o id do Engramind e etapa órfã do reinício.
 */

type State = Record<string, unknown> & { items: Record<string, unknown>[]; steps: Record<string, Record<string, unknown>> }
const holder = vi.hoisted(() => ({
  state: null as State | null,
  backups: new Map<string, Record<string, unknown>>(),
  legacy: [] as Record<string, unknown>[],
  writes: [] as string[],
  stream: null as null | ((input: { signal?: AbortSignal }) => AsyncIterable<{ type: string; text?: string; message?: string }>),
}))

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.')
  let node = target
  for (const key of keys.slice(0, -1)) node = (node[key] ??= {}) as Record<string, unknown>
  node[keys.at(-1)!] = value
}

vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>()
  const collection = {
    find: () => ({ sort: () => ({ toArray: async () => structuredClone(holder.legacy) }) }),
    countDocuments: async () => holder.legacy.length,
    // Qualquer escrita na coleção antiga é registrada (e o teste exige que não haja nenhuma).
    ...Object.fromEntries(['insertOne', 'insertMany', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'replaceOne', 'findOneAndUpdate', 'drop'].map((name) => [name, async () => holder.writes.push(name)])),
  }
  const mocked = { ...actual.default, connection: { db: { collection: () => collection } } }
  return { ...actual, default: mocked }
})
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local', name: 'Dono' }) }))
vi.mock('@/features/engramind/server/migration-models', () => ({
  LEGACY_MEMORIES_COLLECTION: 'agent_memories',
  MIGRATION_ID: 'agent-memories',
  MemoryBackup: {
    create: async (doc: Record<string, unknown>) => holder.backups.set(String(doc._id), structuredClone(doc)),
    findById: (id: string) => ({ select: () => ({ lean: async () => holder.backups.get(id) ?? null }), lean: async () => holder.backups.get(id) ?? null }),
  },
  MemoryMigration: {
    findById: () => ({ lean: async () => (holder.state ? structuredClone(holder.state) : null) }),
    updateOne: async (_filter: unknown, update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> }) => {
      if (!holder.state && update.$setOnInsert) holder.state = { _id: 'agent-memories', ...structuredClone(update.$setOnInsert) } as State
      for (const [path, value] of Object.entries(update.$set ?? {})) setPath(holder.state as Record<string, unknown>, path, structuredClone(value))
    },
  },
}))
vi.mock('@/features/engramind/server/shared', () => ({ AcaoAuditoria: { EXECUTAR: 'EXECUTAR', ATUALIZAR: 'ATUALIZAR' }, auditEngramind: vi.fn(async () => undefined), engramindLog: { info: vi.fn(), warn: vi.fn() }, publishEngramind: vi.fn(async () => undefined) }))
vi.mock('@/features/engramind/server/client', () => ({ engramindCall: vi.fn() }))
vi.mock('@/features/engramind/server/memory-network', () => ({ ensureAgentMemoryNetwork: vi.fn(), ensureMemoryChannel: vi.fn() }))
vi.mock('@/features/ai/server/memory-settings', () => ({
  memorySettings: async () => ({ textMin: 3, textMax: 4000, maxBatch: 100, budgetTokens: 4000, categories: [{ key: 'PROJECT_RULES', label: 'Regras' }] }),
  memoryLimitsFor: async () => ({ textMin: 3, textMax: 4000 }),
}))
vi.mock('@/lib/ai/stream', () => ({ streamAi: (input: { signal?: AbortSignal }) => holder.stream!(input) }))

import { compactCombination, downloadBackup, generateBackup, getMigration, resetMigrationRuntimeForTests, runCurator, setCuratorTimeoutForTests } from '@/features/engramind/server/migration'

const legacy = (id: string, texto: string, extra: Record<string, unknown> = {}) => ({ _id: id, agentId: 'opex-owner', centralId: null, texto, resumo: texto.slice(0, 10), createdBy: 'local', createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'), ...extra })
const replying = (text: string) => async function* () {
  yield { type: 'delta', text }
}
const never = () => (input: { signal?: AbortSignal }) => ({
  [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<{ type: string }>>((_, reject) => input.signal?.addEventListener('abort', () => reject(new Error('abortado')))) }),
})
const CURATOR = { provider: 'gemini' as const, model: 'flash', variant: null }
const stepDone = (key: string) => vi.waitFor(() => expect(['done', 'failed']).toContain(holder.state!.steps[key]!.status), { timeout: 3000 })

beforeEach(() => {
  holder.state = null
  holder.backups.clear()
  holder.writes = []
  holder.legacy = [legacy('a1', 'Use pnpm.'), legacy('a2', 'Responda em pt-BR.', { origin: { source: 'mentor', label: 'Mentor · OPE-1' } })]
  holder.stream = null
  resetMigrationRuntimeForTests()
  setCuratorTimeoutForTests(null)
})

describe('etapas da migração', () => {
  it('backup: hash estável, nenhuma escrita em agent_memories; gerar de novo preserva decisão e importação de texto igual', async () => {
    const first = await generateBackup('local')
    expect(first.backup).toMatchObject({ count: 2, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(holder.state!.items.map((item) => item.ownerProtected)).toEqual([true, false])
    holder.state!.items[0]!.decision = { decisao: 'migrar' }
    holder.state!.items[0]!.imported = { engramindId: 'm_1', key: 'k', at: new Date(), duplicate: false }
    holder.state!.items[1]!.decision = { decisao: 'migrar' }
    holder.legacy[1]!.texto = 'Responda sempre em pt-BR.'
    const second = await generateBackup('local')
    expect(second.backup!.sha256).not.toBe(first.backup!.sha256)
    expect(holder.state!.items[0]).toMatchObject({ decision: { decisao: 'migrar' }, imported: { engramindId: 'm_1' } })
    expect(holder.state!.items[1]).toMatchObject({ decision: null, imported: null })
    holder.legacy[1]!.texto = 'Responda em pt-BR.'
    expect((await generateBackup('local')).backup!.sha256).toBe(first.backup!.sha256)
    expect(holder.writes).toEqual([])
  })

  it('snapshot baixado traz o id do Engramind de cada memória importada e o hash original', async () => {
    const { backup } = await generateBackup('local')
    holder.state!.items[0]!.imported = { engramindId: 'm_abc', key: 'k', at: new Date(), duplicate: false }
    const body = JSON.parse((await downloadBackup()).body)
    expect(body.sha256).toBe(backup!.sha256)
    expect(body.memorias.map((item: { id: string; engramindId: string | null }) => [item.id, item.engramindId])).toEqual([['a1', 'm_abc'], ['a2', null]])
  })

  it('curador sem backup é recusado (409) e não chama o modelo', async () => {
    holder.stream = vi.fn()
    await expect(runCurator(CURATOR, 'local')).rejects.toMatchObject({ status: 409, code: 'MIGRATION_NO_BACKUP' })
    expect(holder.stream).not.toHaveBeenCalled()
  })

  it('curador classifica todas: resposta válida aplica a decisão; bloco que não responde no tempo vira revisar_dono', async () => {
    await generateBackup('local')
    holder.stream = replying(JSON.stringify([{ id: 'a1', decisao: 'migrar', motivo: 'ok', confianca: 0.9 }, { id: 'a2', decisao: 'migrar', motivo: 'ok', confianca: 0.9 }]))
    await runCurator(CURATOR, 'local')
    await stepDone('triage')
    expect(holder.state!.items.map((item) => (item.decision as { decisao: string }).decisao)).toEqual(['migrar', 'migrar'])

    setCuratorTimeoutForTests(20)
    holder.stream = never()
    await runCurator(CURATOR, 'local')
    await stepDone('triage')
    expect(holder.state!.steps.triage!.status).toBe('done')
    expect(holder.state!.items.map((item) => (item.decision as { decisao: string }).decisao)).toEqual(['revisar_dono', 'revisar_dono'])
  })

  it('compactação que não responde no tempo vira falha (não fica em andamento) e libera as outras etapas', async () => {
    await generateBackup('local')
    holder.stream = replying(JSON.stringify([{ id: 'a1', decisao: 'migrar', motivo: 'ok', confianca: 0.9 }, { id: 'a2', decisao: 'migrar', motivo: 'ok', confianca: 0.9 }]))
    await runCurator(CURATOR, 'local')
    await stepDone('triage')
    const combo = (await getMigration()).budget[0]!
    setCuratorTimeoutForTests(20)
    holder.stream = never()
    await compactCombination(combo.key, 'local')
    await stepDone('compact')
    expect(holder.state!.steps.compact).toMatchObject({ status: 'failed', error: expect.stringContaining('O curador não respondeu') })
    await expect(generateBackup('local')).resolves.toBeTruthy()
  })

  it('etapa "em andamento" de antes do reinício vira falha com Tentar novamente', async () => {
    await generateBackup('local')
    holder.state!.steps.triage = { status: 'running', error: null, startedAt: new Date('2020-01-01T00:00:00Z'), finishedAt: null, progress: null }
    const dto = await getMigration()
    expect(dto.steps.triage).toMatchObject({ status: 'failed', error: 'Interrompida pelo reinício do Opex: tente novamente' })
  })
})
