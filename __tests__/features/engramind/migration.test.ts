import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEngramind, type FakeEngramind } from '../../helpers/fake-engramind'

/** OPE-104: importação da migração de memórias (só aprovadas, por canal, em lotes, idempotente) e revisão em lote. */

type State = Record<string, unknown> & { items: Record<string, unknown>[]; steps: Record<string, Record<string, unknown>> }
const holder = vi.hoisted(() => ({ fake: null as unknown as FakeEngramind, state: null as unknown as State | null, failOnCall: 0 }))

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.')
  let node = target
  for (const key of keys.slice(0, -1)) node = (node[key] ??= {}) as Record<string, unknown>
  node[keys.at(-1)!] = value
}
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/features/engramind/server/migration-models', () => ({
  LEGACY_MEMORIES_COLLECTION: 'agent_memories',
  MIGRATION_ID: 'agent-memories',
  MemoryBackup: { findById: () => ({ select: () => ({ lean: async () => null }), lean: async () => null }) },
  MemoryMigration: {
    findById: () => ({ lean: async () => (holder.state ? structuredClone(holder.state) : null) }),
    updateOne: async (_filter: unknown, update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> }) => {
      if (!holder.state && update.$setOnInsert) holder.state = { _id: 'agent-memories', ...structuredClone(update.$setOnInsert) } as State
      for (const [path, value] of Object.entries(update.$set ?? {})) setPath(holder.state as Record<string, unknown>, path, structuredClone(value))
    },
  },
}))
vi.mock('@/features/engramind/server/shared', () => ({ AcaoAuditoria: { EXECUTAR: 'EXECUTAR', ATUALIZAR: 'ATUALIZAR' }, auditEngramind: vi.fn(async () => undefined), engramindLog: { info: vi.fn(), warn: vi.fn() }, publishEngramind: vi.fn(async () => undefined) }))
vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: (...args: Parameters<FakeEngramind['engramindCall']>) => {
    if (args[1].path === '/v1/memories/import' && holder.failOnCall && --holder.failOnCall === 0) return Promise.reject(new Error('Engramind caiu no meio'))
    return holder.fake.engramindCall(...args)
  },
}))
vi.mock('@/features/engramind/server/memory-network', () => ({
  ensureAgentMemoryNetwork: async () => ({ step: { id: 'agent-memories', status: 'ok', message: 'ok' } }),
  ensureMemoryChannel: async (slug: string) => {
    if (!holder.fake.state.channels.has(slug)) holder.fake.state.channels.set(slug, { slug, archived_at: null })
    return 'created'
  },
}))
vi.mock('@/features/ai/server/memory-settings', () => ({
  memorySettings: async () => ({ textMin: 3, textMax: 4000, maxBatch: 2, budgetTokens: 4000, categories: [{ key: 'PROJECT_RULES', label: 'Regras' }] }),
  memoryLimitsFor: async () => ({ textMin: 3, textMax: 4000 }),
}))

import { importApproved, reviewBulk } from '@/features/engramind/server/migration'
import { importIdempotencyKey } from '@/features/engramind/server/operations-runner'

const IDLE = { status: 'idle', error: null, startedAt: null, finishedAt: null, progress: null }
const decision = (decisao: string) => ({ decisao, motivo: 'm', textoProposto: null, categoriaProposta: 'PROJECT_RULES', canalDestino: 'agentes/opex/dono', duplicataDe: null, confianca: 0.9 })
const item = (id: string, decisao: string, status: string, overrides: Record<string, unknown> = {}) => ({
  sourceId: id,
  list: 'opex-owner',
  centralId: null,
  texto: `Memória ${id}.`,
  resumo: id,
  origin: null,
  createdBy: 'local',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ownerProtected: true,
  channel: 'agentes/opex/dono',
  decision: decision(decisao),
  review: { status, texto: null, categoria: null, at: null },
  imported: null,
  ...overrides,
})
const seed = (items: Record<string, unknown>[]) => {
  holder.state = { _id: 'agent-memories', backupId: 'b1', steps: { backup: { ...IDLE, status: 'done' }, triage: { ...IDLE, status: 'done' }, compact: IDLE, import: IDLE }, curator: { provider: 'gemini', model: 'flash', variant: null, ranAt: new Date() }, items, firstCompletedAt: null, lastImportAt: null }
}
const importDone = () => vi.waitFor(() => expect(['done', 'failed']).toContain(holder.state!.steps.import!.status), { timeout: 3000 })
const importCalls = () => holder.fake.state.calls.filter((call) => call.path === '/v1/memories/import')

beforeEach(() => {
  holder.fake = createFakeEngramind()
  holder.fake.state.channels.set('agentes/opex/dono', { slug: 'agentes/opex/dono', archived_at: null })
  holder.failOnCall = 0
})

describe('importação da migração', () => {
  it('só as aprovadas, no canal da lista de origem, em lotes de max_batch, com a chave da importação manual; ids gravados', async () => {
    seed([item('a', 'migrar', 'aprovada'), item('b', 'migrar', 'aprovada'), item('c', 'migrar', 'aprovada'), item('d', 'migrar', 'pendente'), item('e', 'migrar', 'rejeitada')])
    // Mesmo se uma decisão antiga trouxer outro destino, a importação usa o canal da lista.
    ;(holder.state!.items[0]!.decision as Record<string, unknown>).canalDestino = 'opex'
    await importApproved('local')
    await importDone()
    expect(holder.state!.steps.import!.status).toBe('done')
    const calls = importCalls()
    expect(calls.map((call) => (call.body as { memories: unknown[] }).memories.length)).toEqual([2, 1])
    expect(calls.every((call) => (call.body as { channel: string }).channel === 'agentes/opex/dono')).toBe(true)
    const body = calls[0]!.body as { channel: string; memories: unknown[] }
    expect(calls[0]!.idempotencyKey).toBe(importIdempotencyKey(body))
    expect((body.memories[0] as Record<string, unknown>)).toMatchObject({ text: 'Memória a.', created_at: '2026-01-01T00:00:00.000Z', origin: { source: 'dono', label: 'Dono' }, author: { app: 'opex' } })
    const imported = holder.state!.items.filter((row) => row.imported).map((row) => row.sourceId)
    expect(imported).toEqual(['a', 'b', 'c'])
    expect(holder.state!.firstCompletedAt).not.toBeNull()
  })

  it('repetir a mesma importação (mesmo conteúdo) não duplica: a chave é a mesma e o Engramind devolve o resultado salvo', async () => {
    seed([item('a', 'migrar', 'aprovada')])
    await importApproved('local')
    await importDone()
    const firstKey = importCalls()[0]!.idempotencyKey
    seed([item('a', 'migrar', 'aprovada')])
    await importApproved('local')
    await importDone()
    expect(importCalls()[1]!.idempotencyKey).toBe(firstKey)
    expect(holder.fake.state.memories.size).toBe(1)
  })

  it('texto já existente no canal volta como duplicada e guarda o id existente', async () => {
    const existing = holder.fake.createMemory('agentes/opex/dono', { text: 'Memória a.' }, null).memory
    seed([item('a', 'migrar', 'aprovada')])
    await importApproved('local')
    await importDone()
    expect(holder.state!.items[0]!.imported).toMatchObject({ engramindId: existing.id, duplicate: true })
  })

  it('falha no meio: o lote importado fica marcado e tentar de novo importa só o resto', async () => {
    seed([item('a', 'migrar', 'aprovada'), item('b', 'migrar', 'aprovada'), item('c', 'migrar', 'aprovada')])
    holder.failOnCall = 2
    await importApproved('local')
    await importDone()
    expect(holder.state!.steps.import!).toMatchObject({ status: 'failed', error: 'Engramind caiu no meio' })
    expect(holder.state!.items.filter((row) => row.imported).map((row) => row.sourceId)).toEqual(['a', 'b'])
    await importApproved('local')
    await importDone()
    expect(holder.state!.items.every((row) => row.imported)).toBe(true)
    expect(holder.fake.state.memories.size).toBe(3)
  })

  it('nada aprovado: recusa sem chamar o Engramind', async () => {
    seed([item('a', 'migrar', 'pendente')])
    await expect(importApproved('local')).rejects.toMatchObject({ code: 'MIGRATION_NOTHING_APPROVED' })
    expect(importCalls()).toHaveLength(0)
  })
})

describe('revisão em lote', () => {
  it('aprovar a lista não aprova as que pedem atenção; incluindo-as, aprova as de revisão do dono mas nunca as descartadas', async () => {
    seed([item('a', 'migrar', 'pendente'), item('b', 'revisar_dono', 'pendente'), item('c', 'descartar', 'pendente', { ownerProtected: false })])
    await reviewBulk({ list: 'opex-owner', centralId: null, status: 'aprovada', includeAttention: false }, 'local')
    expect(holder.state!.items.map((row) => (row.review as { status: string }).status)).toEqual(['aprovada', 'pendente', 'pendente'])
    await reviewBulk({ list: 'opex-owner', centralId: null, status: 'aprovada', includeAttention: true }, 'local')
    expect(holder.state!.items.map((row) => (row.review as { status: string }).status)).toEqual(['aprovada', 'aprovada', 'pendente'])
  })

  it('aprovar em lote pula a memória cujo texto final não cabe (fica pendente) e aprova as demais', async () => {
    const tooLong = { ...decision('migrar_reescrevendo'), textoProposto: 'x'.repeat(4001) }
    seed([item('a', 'migrar', 'pendente'), item('b', 'migrar_reescrevendo', 'pendente', { decision: tooLong }), item('c', 'migrar', 'pendente')])
    await expect(reviewBulk({ list: 'opex-owner', centralId: null, status: 'aprovada', includeAttention: false }, 'local')).resolves.toBeTruthy()
    expect(holder.state!.items.map((row) => (row.review as { status: string }).status)).toEqual(['aprovada', 'pendente', 'aprovada'])
  })
})
