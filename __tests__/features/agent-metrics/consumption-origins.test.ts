import { describe, expect, it } from 'vitest'
import { AGENT_IDS } from '@/features/agent-metrics/catalog'
import { AGENT_CONSUMPTION_ORIGINS, consumptionConcernsAgent } from '@/features/agent-metrics/consumption-origins'

/**
 * Origens de consumo de cada agente (OPE-205): base da Taxa de cache. Os valores ficam fixos aqui de propósito: uma
 * origem renomeada ou digitada errada deixaria a taxa do agente em "—" sem erro nenhum.
 */

const EXPECTED: Record<string, string[]> = {
  opex: ['opex-agent', 'opex-title', 'opex-client-agent', 'opex-client-title'],
  maddox: ['maddox-agent', 'maddox-title', 'maddox-client-agent', 'maddox-client-title'],
  orcamentista: ['budget-preview', 'estimate-hours'],
  catalogador: ['task-summary', 'task-tags'],
  refinador: ['refinement'],
  desenvolvedor: ['agentic'],
  arquiteto: ['architect-agent'],
  adversario: ['adversarial-agent'],
  revisor: ['pr-review'],
  mentor: ['adversarial-mentor-decision', 'adversarial-mentor-router', 'adversarial-mentor-digest', 'adversarial-mentor-writer', 'adversarial-mentor-reorg-router', 'adversarial-mentor-reorg-writer'],
  rotineiros: ['routine-agent', 'routine-agent-chat', 'routine-agent-chat-title', 'routine-agent-provisioning'],
  secretario: ['secretary-agent', 'secretary-decision', 'secretary-analysis'],
}

describe('AGENT_CONSUMPTION_ORIGINS (OPE-205)', () => {
  it('cada agente do catálogo tem exatamente as origens que as features gravam', () => {
    expect(Object.keys(AGENT_CONSUMPTION_ORIGINS).sort()).toEqual([...AGENT_IDS].sort())
    for (const agent of AGENT_IDS) expect([...AGENT_CONSUMPTION_ORIGINS[agent]].sort(), agent).toEqual([...EXPECTED[agent]!].sort())
  })

  it('nenhuma origem pertence a dois agentes', () => {
    const all = Object.values(AGENT_CONSUMPTION_ORIGINS).flat()
    expect(new Set(all).size).toBe(all.length)
  })

  it('consumptionConcernsAgent: só a origem do agente; payload sem origem não conta', () => {
    expect(consumptionConcernsAgent('desenvolvedor', { provider: 'opencode', origin: 'agentic' })).toBe(true)
    expect(consumptionConcernsAgent('desenvolvedor', { provider: 'opencode', origin: 'routine-agent' })).toBe(false)
    expect(consumptionConcernsAgent('secretario', { origin: 'secretary-simulation' })).toBe(false)
    expect(consumptionConcernsAgent('desenvolvedor', null)).toBe(false)
    expect(consumptionConcernsAgent('desenvolvedor', {})).toBe(false)
  })
})
