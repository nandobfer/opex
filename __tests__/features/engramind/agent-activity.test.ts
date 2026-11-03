import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isAdoptionStale } from '@/features/engramind/agent-activity'

/** OPE-117: adoção do aprendizado autônomo por agente (gravações 7d, última, aviso de 14 dias, última entrega). */

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(async (_pipeline: unknown[]) => [] as { _id: string; total: number; last7d: number; lastWriteAt: Date | null }[]),
  deliveries: vi.fn(async () => [] as unknown[]),
  settings: { opex: true, maddox: false, adversario: true, arquiteto: true, desenvolvedor: true },
  agents: [] as { slug: string; created_at: string }[],
}))
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/db/models/AuditLog', () => ({ AuditLog: { aggregate: mocks.aggregate } }))
vi.mock('@/features/engramind/server/deliveries', () => ({ listDeliveries: mocks.deliveries }))
vi.mock('@/features/engramind/server/shared', () => ({ engramindLog: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/features/engramind/server/models', () => ({ ENGRAMIND_STATE_ID: 'engramind', engramindDb: async () => undefined, EngramindState: { findById: () => ({ select: () => ({ lean: async () => ({ agentTokens: {} }) }) }) } }))
vi.mock('@/features/engramind/server/client', () => ({ engramindCall: async () => ({ agents: mocks.agents }) }))
vi.mock('@/features/ai/server/self-memory/settings', () => ({ getSelfMemorySettings: async () => ({ settings: mocks.settings, updatedAt: null }) }))

import { listAgentActivity } from '@/features/engramind/server/agent-activity'

const NOW = new Date('2026-11-03T12:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 3600_000)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.agents = []
  mocks.settings = { opex: true, maddox: false, adversario: true, arquiteto: true, desenvolvedor: true }
})

describe('aviso de adoção (14 dias)', () => {
  it('liga só com o aprendizado ligado e sem gravar há 14 dias ou mais', () => {
    expect(isAdoptionStale({ selfMemory: true, lastWriteAt: daysAgo(14), agentCreatedAt: null }, NOW)).toBe(true)
    expect(isAdoptionStale({ selfMemory: true, lastWriteAt: daysAgo(13), agentCreatedAt: null }, NOW)).toBe(false)
    expect(isAdoptionStale({ selfMemory: false, lastWriteAt: daysAgo(30), agentCreatedAt: null }, NOW)).toBe(false)
  })

  it('nunca gravou: avisa só quando o agente existe há mais de 14 dias', () => {
    expect(isAdoptionStale({ selfMemory: true, lastWriteAt: null, agentCreatedAt: daysAgo(20) }, NOW)).toBe(true)
    expect(isAdoptionStale({ selfMemory: true, lastWriteAt: null, agentCreatedAt: daysAgo(3) }, NOW)).toBe(false)
    expect(isAdoptionStale({ selfMemory: true, lastWriteAt: null, agentCreatedAt: null }, NOW)).toBe(false)
  })
})

describe('adoção por agente', () => {
  it('lê a auditoria MemoriaAgente pelos atores agente:<identidade>, com o recorte de 7 dias', async () => {
    mocks.aggregate.mockResolvedValueOnce([{ _id: 'agente:desenvolvedor', total: 9, last7d: 3, lastWriteAt: daysAgo(1) }])
    const rows = await listAgentActivity(NOW)
    const match = (mocks.aggregate.mock.calls[0]![0] as { $match?: Record<string, unknown> }[])[0]!.$match!
    expect(match.entidade).toBe('MemoriaAgente')
    expect((match['dadosNovos.ator'] as { $in: string[] }).$in).toContain('agente:mentor')
    expect(rows.find((row) => row.agent === 'desenvolvedor')).toMatchObject({ total: 9, last7d: 3, lastWriteAt: daysAgo(1).toISOString(), stale: false, selfMemory: true })
  })

  it('zero explícito: agente sem gravações volta com 0, sem data e sem entrega', async () => {
    const rows = await listAgentActivity(NOW)
    expect(rows.map((row) => row.agent)).toEqual(['opex', 'maddox', 'adversario', 'arquiteto', 'desenvolvedor', 'mentor'])
    expect(rows.find((row) => row.agent === 'opex')).toMatchObject({ total: 0, last7d: 0, lastWriteAt: null, delivery: null })
    expect(rows.find((row) => row.agent === 'mentor')!.selfMemory).toBeNull()
  })

  it('aviso de 14 dias com o aprendizado ligado e desligado', async () => {
    mocks.aggregate.mockResolvedValueOnce([
      { _id: 'agente:opex', total: 2, last7d: 0, lastWriteAt: daysAgo(20) },
      { _id: 'agente:maddox', total: 2, last7d: 0, lastWriteAt: daysAgo(20) },
    ])
    const rows = await listAgentActivity(NOW)
    expect(rows.find((row) => row.agent === 'opex')!.stale).toBe(true)
    expect(rows.find((row) => row.agent === 'maddox')!.stale).toBe(false)
  })

  it('traz a última entrega do contexto (último contexto lido) e nunca lança com a auditoria fora', async () => {
    mocks.deliveries.mockResolvedValueOnce([{ consumer: 'opex', fullIds: ['m_1'], titleIds: ['m_2'], overflow: 1, counts: { full: 1, titles: 1, overflow: 1 }, channels: ['opex'], delivered: ['opex'], version: 'cv_1', focusMode: 'hybrid', source: 'live', at: daysAgo(0).toISOString() }])
    mocks.aggregate.mockRejectedValueOnce(new Error('mongo fora'))
    const rows = await listAgentActivity(NOW)
    expect(rows.find((row) => row.agent === 'opex')!.delivery).toMatchObject({ fullIds: ['m_1'], titleIds: ['m_2'], version: 'cv_1' })
    expect(rows.every((row) => row.total === 0)).toBe(true)
  })
})
