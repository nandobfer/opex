import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainError } from '@/lib/api/route'

/**
 * Portão da migração dos nomes dos canais (OPE-206): o turno segue com o contexto em cache (sem chamar o Engramind),
 * a gravação de memória é recusada com o aviso e a fila de pendências espera.
 */

const holder = vi.hoisted(() => ({ maintenance: true, cache: null as Record<string, unknown> | null, calls: 0 }))

vi.mock('@/features/engramind/server/instance', () => ({
  isMemoryMaintenance: async () => holder.maintenance,
  MEMORY_MAINTENANCE_NOTICE: 'Migrando canais de memória',
  assertNoMemoryMaintenance: async () => {
    if (holder.maintenance) throw new DomainError(503, 'Migrando canais de memória: tente de novo em alguns minutos.', 'ENGRAMIND_MIGRATING')
  },
  channelNamespace: async () => ({ app: 'opex', prefixed: false }),
}))
vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: async () => {
    holder.calls++
    throw new Error('não deveria chamar o Engramind')
  },
}))
vi.mock('@/features/engramind/server/memory-network', () => ({ agentTarget: async () => ({ baseUrl: 'http://e', token: 't' }) }))
vi.mock('@/features/engramind/server/shared', () => ({ engramindLog: { info: vi.fn(), warn: vi.fn() }, publishEngramind: vi.fn(async () => undefined) }))
vi.mock('@/features/engramind/server/models', () => ({
  ENGRAMIND_STATE_ID: 'engramind',
  engramindDb: async () => undefined,
  EngramindContextCache: { findById: () => ({ lean: async () => holder.cache }) },
  EngramindState: { findById: () => ({ select: () => ({ lean: async () => null }) }), updateOne: async () => undefined },
}))
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: vi.fn(), AcaoAuditoria: {} }))

import { getAgentMemoryContext } from '@/features/engramind/server/memory-context'
import { createAgentMemory } from '@/features/ai/server/agent-memory-service'
import { isEngramindUnavailable } from '@/features/engramind/server/pending-writes'

beforeEach(() => {
  holder.maintenance = true
  holder.cache = null
  holder.calls = 0
})

describe('manutenção das memórias (migração B)', () => {
  it('o turno usa o contexto em cache com o aviso, sem chamar o Engramind', async () => {
    holder.cache = { _id: 'k', content: '<memories/>', fetchedAt: new Date('2026-11-27T10:00:00Z'), counts: { full: 1, titles: 0, overflow: 0 } }
    const result = await getAgentMemoryContext('maddox', ['opex', 'agentes/maddox/dono'])
    expect(result).toMatchObject({ block: '<memories/>', source: 'cache', reason: 'Migrando canais de memória' })
    expect(holder.calls).toBe(0)
  })

  it('sem cache, o turno segue sem memórias e com o aviso', async () => {
    expect(await getAgentMemoryContext('opex', ['opex'])).toMatchObject({ block: '', source: 'none', reason: 'Migrando canais de memória' })
  })

  it('gravação de memória é recusada com ENGRAMIND_MIGRATING (e a fila de pendências a guarda)', async () => {
    const error = await createAgentMemory('adversarial', 'Nova regra', 'local').catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'ENGRAMIND_MIGRATING', status: 503 })
    expect(isEngramindUnavailable(error)).toBe(true)
    expect(holder.calls).toBe(0)
  })
})
