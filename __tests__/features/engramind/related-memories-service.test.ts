import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-164: cache das similares das memórias. Fonte (decisão do dono): o `similar` de `GET /v1/memories/{id}`
 * pelo admin (sem efeito colateral; mesmo canal, até 3). O primeiro cálculo só começa quando a rede pede; depois,
 * só as memórias do webhook `memory.*` são recalculadas. O Engramind é sempre mockado.
 */

type Doc = { _id: string; channel: string; related: { id: string; score: number }[]; memoryVersion: number | null; computedAt: Date | null; failedAt: Date | null }

const mocks = vi.hoisted(() => ({
  state: null as null | { relatedMemories?: { requestedAt: Date; completedAt: Date | null } | null },
  docs: new Map<string, Doc>(),
  call: vi.fn(),
  published: [] as unknown[],
  warn: vi.fn(),
  info: vi.fn(),
}))

const matches = (doc: Doc, filter: Record<string, unknown>) =>
  Object.entries(filter).every(([key, value]) => {
    if (key === '_id') return typeof value === 'object' && value && '$in' in value ? (value as { $in: string[] }).$in.includes(doc._id) : doc._id === value
    if (key === 'related.id') return doc.related.some((hit) => hit.id === value)
    if (key === 'related.0') return doc.related.length > 0
    if (key === 'channel') return doc.channel === value
    return true
  })
const query = <T,>(value: () => T) => ({ select: () => ({ lean: async () => value() }) })

vi.mock('@/features/engramind/server/models', () => ({
  ENGRAMIND_STATE_ID: 'engramind',
  engramindDb: async () => {},
  EngramindState: {
    findById: () => query(() => mocks.state),
    updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
      const set = update.$set
      if ('relatedMemories' in set) mocks.state = { relatedMemories: set.relatedMemories as never }
      if ('relatedMemories.completedAt' in set) mocks.state = { relatedMemories: { requestedAt: mocks.state?.relatedMemories?.requestedAt ?? new Date(), completedAt: set['relatedMemories.completedAt'] as Date } }
    },
  },
  EngramindRelatedMemory: {
    find: (filter: Record<string, unknown>) => query(() => [...mocks.docs.values()].filter((doc) => matches(doc, filter))),
    findById: (id: string) => query(() => mocks.docs.get(id) ?? null),
    updateOne: async (filter: { _id: string }, update: { $set: Partial<Doc> }) => {
      const current = mocks.docs.get(filter._id) ?? { _id: filter._id, channel: '', related: [], memoryVersion: null, computedAt: null, failedAt: null }
      mocks.docs.set(filter._id, { ...current, ...update.$set })
    },
    updateMany: async (filter: Record<string, unknown>, update: { $pull: { related: { id: string } } }) => {
      for (const doc of mocks.docs.values()) if (matches(doc, filter)) doc.related = doc.related.filter((hit) => hit.id !== update.$pull.related.id)
    },
    deleteOne: async (filter: { _id: string }) => void mocks.docs.delete(filter._id),
  },
}))
vi.mock('@/features/engramind/server/client', () => ({ engramindCall: mocks.call }))
vi.mock('@/features/engramind/server/shared', () => ({
  engramindLog: { info: mocks.info, warn: mocks.warn },
  publishEngramind: async (payload: unknown) => void mocks.published.push(payload),
}))

import { DomainError } from '@/lib/api/route'
import { computeRelated, getRelatedMemories, onRelatedMemoryEvent, RELATED_BATCH_SIZE, RELATED_CONCURRENCY, relatedFillDone } from '@/features/engramind/server/related-memories'

const ids = (total: number) => Array.from({ length: total }, (_, index) => `m_${index}`)
let memories: { id: string; channel: string; similar: { id: string; channel: string; score: number }[] }[] = []
let active = 0
let maxActive = 0

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = null
  mocks.docs = new Map()
  mocks.published = []
  active = 0
  maxActive = 0
  memories = ids(4).map((id, index) => ({ id, channel: 'eng', similar: [{ id: `m_${(index + 1) % 4}`, channel: 'eng', score: 0.9 }, { id: 'm_outro', channel: 'outro', score: 0.95 }, { id, channel: 'eng', score: 1 }] }))
  mocks.call.mockImplementation(async (_method: string, request: { path: string; query?: { cursor?: string } }) => {
    if (request.path === '/v1/memories') return { memories: memories.map(({ id }) => ({ id, text: 'nunca guardado' })), next_cursor: null }
    const id = decodeURIComponent(request.path.split('/').pop()!)
    const memory = memories.find((item) => item.id === id)
    if (!memory) throw new DomainError(404, 'Memória não encontrada', 'ENGRAMIND_MEMORY_NOT_FOUND')
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active -= 1
    // `MemoryDetail` real do Engramind: plano (`allOf [Memory, { similar }]`), sem envelope `memory`.
    return { id, channel: memory.channel, version: 2, text: 'texto', status: 'active', similar: memory.similar }
  })
})

describe('similares das memórias (OPE-164)', () => {
  it('o primeiro pedido marca o cache, devolve o que existe e calcula em segundo plano, publicando a cada lote', async () => {
    const first = await getRelatedMemories()
    expect(first).toMatchObject({ related: {}, ready: false })
    expect(mocks.state?.relatedMemories?.requestedAt).toBeInstanceOf(Date)
    await relatedFillDone()
    expect(mocks.published).toEqual([{ type: 'related-memories' }])
    const second = await getRelatedMemories()
    expect(second.ready).toBe(true)
    expect(second.related.m_0).toEqual([{ id: 'm_1', score: 0.9 }])
  })

  it('D1/D2: guarda só ids e notas do mesmo canal, sem a própria memória e sem o texto', async () => {
    await computeRelated('m_2')
    expect(mocks.docs.get('m_2')).toMatchObject({ channel: 'eng', related: [{ id: 'm_3', score: 0.9 }], memoryVersion: 2 })
    expect(JSON.stringify([...mocks.docs.values()])).not.toContain('texto')
    expect(mocks.call).toHaveBeenCalledWith('GET', { path: '/v1/memories/m_2' })
  })

  it('muitas memórias: lotes com limite de chamadas simultâneas', async () => {
    memories = ids(RELATED_BATCH_SIZE + 5).map((id) => ({ id, channel: 'eng', similar: [] }))
    await getRelatedMemories()
    await relatedFillDone()
    expect(maxActive).toBeLessThanOrEqual(RELATED_CONCURRENCY)
    expect(mocks.published).toHaveLength(2)
    expect(mocks.docs.size).toBe(RELATED_BATCH_SIZE + 5)
  })

  it('falha do Engramind vira aviso e failedAt, sem quebrar', async () => {
    mocks.call.mockRejectedValueOnce(new DomainError(503, 'fora do ar', 'ENGRAMIND_UNREACHABLE'))
    expect(await computeRelated('m_0')).toBe('failed')
    expect(mocks.docs.get('m_0')?.failedAt).toBeInstanceOf(Date)
    expect(mocks.warn).toHaveBeenCalled()
  })

  it('sem o cache pedido, os webhooks não calculam nada', async () => {
    expect(await onRelatedMemoryEvent({ type: 'memory.updated', memory_ids: ['m_0'] })).toBe(false)
    expect(mocks.call).not.toHaveBeenCalled()
  })

  it('memory.updated recalcula só a memória do evento; as que apontam para ela continuam no cache', async () => {
    mocks.state = { relatedMemories: { requestedAt: new Date(), completedAt: new Date() } }
    mocks.docs.set('m_3', { _id: 'm_3', channel: 'eng', related: [{ id: 'm_0', score: 0.8 }], memoryVersion: 1, computedAt: new Date(), failedAt: null })
    expect(await onRelatedMemoryEvent({ type: 'memory.updated', memory_ids: ['m_0'] })).toBe(true)
    expect(mocks.call).toHaveBeenCalledTimes(1)
    expect(mocks.docs.get('m_0')?.related).toEqual([{ id: 'm_1', score: 0.9 }])
    expect(mocks.docs.get('m_3')?.related).toEqual([{ id: 'm_0', score: 0.8 }])
    expect(mocks.published).toEqual([{ type: 'related-memories' }])
  })

  it('memória movida de canal sai das listas do canal antigo', async () => {
    mocks.state = { relatedMemories: { requestedAt: new Date(), completedAt: new Date() } }
    mocks.docs.set('m_0', { _id: 'm_0', channel: 'antigo', related: [], memoryVersion: 1, computedAt: new Date(), failedAt: null })
    mocks.docs.set('m_9', { _id: 'm_9', channel: 'antigo', related: [{ id: 'm_0', score: 0.8 }], memoryVersion: 1, computedAt: new Date(), failedAt: null })
    await onRelatedMemoryEvent({ type: 'memory.updated', memory_ids: ['m_0'] })
    expect(mocks.docs.get('m_9')?.related).toEqual([])
  })

  it('memory.deleted remove a memória do cache e das listas das outras; memory.archived não faz nada', async () => {
    mocks.state = { relatedMemories: { requestedAt: new Date(), completedAt: new Date() } }
    mocks.docs.set('m_0', { _id: 'm_0', channel: 'eng', related: [{ id: 'm_1', score: 0.9 }], memoryVersion: 1, computedAt: new Date(), failedAt: null })
    mocks.docs.set('m_1', { _id: 'm_1', channel: 'eng', related: [{ id: 'm_0', score: 0.9 }], memoryVersion: 1, computedAt: new Date(), failedAt: null })
    expect(await onRelatedMemoryEvent({ type: 'memory.archived', memory_ids: ['m_0'] })).toBe(false)
    expect(await onRelatedMemoryEvent({ type: 'memory.deleted', memory_ids: ['m_0'] })).toBe(true)
    expect(mocks.docs.has('m_0')).toBe(false)
    expect(mocks.docs.get('m_1')?.related).toEqual([])
    expect(mocks.call).not.toHaveBeenCalled()
  })

  it('regressão (MemoryDetail plano): grava computedAt e as similares lidas do topo da resposta', async () => {
    expect(await computeRelated('m_0')).toBe('ok')
    expect(mocks.docs.get('m_0')).toMatchObject({ channel: 'eng', related: [{ id: 'm_1', score: 0.9 }], memoryVersion: 2, failedAt: null })
    expect(mocks.docs.get('m_0')?.computedAt).toBeInstanceOf(Date)
  })

  it('regressão: resposta sem channel no topo (o envelope antigo) é falha e não apaga o cache', async () => {
    mocks.docs.set('m_0', { _id: 'm_0', channel: 'eng', related: [{ id: 'm_1', score: 0.9 }], memoryVersion: 1, computedAt: new Date(), failedAt: null })
    mocks.call.mockResolvedValueOnce({ memory: { id: 'm_0', channel: 'eng', version: 2 }, similar: [] })
    expect(await computeRelated('m_0')).toBe('failed')
    expect(mocks.docs.get('m_0')).toMatchObject({ related: [{ id: 'm_1', score: 0.9 }] })
    expect(mocks.docs.get('m_0')?.failedAt).toBeInstanceOf(Date)
  })

  it('regressão: 404 que não é MEMORY_NOT_FOUND (rota, proxy) é falha e não apaga o cache', async () => {
    mocks.docs.set('m_0', { _id: 'm_0', channel: 'eng', related: [{ id: 'm_1', score: 0.9 }], memoryVersion: 1, computedAt: new Date(), failedAt: null })
    mocks.call.mockRejectedValueOnce(new DomainError(404, 'rota não encontrada', 'ENGRAMIND_ROUTE_NOT_FOUND'))
    expect(await computeRelated('m_0')).toBe('failed')
    expect(mocks.docs.has('m_0')).toBe(true)
  })

  it('memória que não existe mais (404 MEMORY_NOT_FOUND) sai do cache', async () => {
    mocks.docs.set('m_x', { _id: 'm_x', channel: 'eng', related: [], memoryVersion: 1, computedAt: new Date(), failedAt: null })
    expect(await computeRelated('m_x')).toBe('gone')
    expect(mocks.docs.has('m_x')).toBe(false)
  })
})
