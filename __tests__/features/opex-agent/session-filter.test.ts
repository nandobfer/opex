import { describe, expect, it, vi } from 'vitest'

/**
 * Sessões do Agente Opex × conversas com os agentes rotineiros (OPE-160): as conversas dos rotineiros
 * ficam nas mesmas coleções e nunca aparecem na lista, nos jobs, na retenção nem nas métricas do Opex.
 */

const h = vi.hoisted(() => ({ filters: [] as unknown[] }))
vi.mock('@/features/auth/server/context', () => ({ clientActorFor: vi.fn() }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => {} }))
vi.mock('@/lib/db/models/Opex', () => ({
  OpexSession: { find: (filter: unknown) => (h.filters.push(filter), { select: () => ({ lean: async () => [] }) }) },
  OpexMessage: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
}))
vi.mock('@/lib/db/models/AgentMetrics', () => ({ AgentConversation: { updateOne: vi.fn(), updateMany: vi.fn() } }))

import { isOpexAgentSession, opexSessionAgentFilter } from '@/features/opex-agent/session-filter'
import { OWNER_SCOPE, sessionFilterOf, sessionScopeOf } from '@/features/opex-agent/server/scope'
import { syncConversations } from '@/features/agent-metrics/server/conversations'

describe('filtro das sessões do Agente Opex', () => {
  it('exclui Maddox e as conversas de rotineiro (o campo ausente é do Opex)', () => {
    expect(opexSessionAgentFilter()).toEqual({ $nin: ['maddox', 'routine'] })
    expect(sessionFilterOf(OWNER_SCOPE)).toEqual({ clientId: null, agent: { $nin: ['maddox', 'routine'] } })
    expect(isOpexAgentSession(undefined)).toBe(true)
    expect(isOpexAgentSession('opex')).toBe(true)
    expect(isOpexAgentSession('routine')).toBe(false)
  })

  it('a conversa de um rotineiro enxerga só as sessões daquele agente', async () => {
    const scope = { ...OWNER_SCOPE, agent: 'routine' as const, routineAgentId: 'ag1' }
    expect(sessionFilterOf(scope)).toEqual({ clientId: null, agent: 'routine', routineAgentId: 'ag1' })
    await expect(sessionScopeOf({ clientId: null, userId: 'local', agent: 'routine', routineAgentId: 'ag1' })).resolves.toEqual(scope)
  })

  it('as métricas de conversas ignoram as conversas de rotineiro', async () => {
    await syncConversations({ from: new Date(0) })
    await syncConversations({ sessionIds: ['s1'] })
    expect(h.filters).toEqual([expect.objectContaining({ agent: { $ne: 'routine' } }), expect.objectContaining({ _id: { $in: ['s1'] }, agent: { $ne: 'routine' } })])
  })
})
