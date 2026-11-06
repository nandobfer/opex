import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  rows: [] as Record<string, unknown>[],
  part: vi.fn(async () => ({ kpis: [{ id: 'duration', label: 'Duração média', hint: '', value: 3, format: 'duration', since: null }], baseCount: 1 })),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(async () => {}) }))
vi.mock('@/lib/db/models/AgentMetrics', () => {
  // Só a consulta dos totais (seleciona custo) recebe as execuções; o Uso por data ao vivo fica vazio.
  const chain = { select: (fields: Record<string, unknown>) => ({ lean: async () => ('costUsd' in fields ? mocks.rows : []) }) }
  return {
    AgentRun: { find: (filter: unknown) => (mocks.find(filter), chain), findOne: () => ({ sort: () => ({ select: () => ({ lean: async () => null }) }) }) },
    AgentUsageDay: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
    AgentMetricTracking: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
  }
})
vi.mock('@/lib/db/models/Orcamento', () => ({ OrcamentoClient: { find: () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) }) } }))
vi.mock('@/lib/db/models/Project', () => ({ Project: { find: () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) }) } }))
vi.mock('@/features/agent-metrics/server/usage-daily', () => ({ ensureFreshRuns: vi.fn(async () => {}) }))
vi.mock('@/features/agent-metrics/server/availability', () => ({ agentAvailability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock('@/features/agent-metrics/server/developer', () => ({ developerMetrics: mocks.part }))
vi.mock('@/features/agent-metrics/server/agents', () => ({
  adversarialMetrics: mocks.part,
  architectMetrics: mocks.part,
  budgetMetrics: mocks.part,
  catalogMetrics: mocks.part,
  conversationMetrics: mocks.part,
  mentorMetrics: mocks.part,
  routineMetrics: mocks.part,
  refinerMetrics: mocks.part,
  reviewerMetrics: mocks.part,
}))

import { runTotals } from '@/features/agent-metrics/logic/common'
import { getAgentMetrics } from '@/features/agent-metrics/server/metrics'
import { agentMetricsQuerySchema } from '@/features/agent-metrics/period'

const NOW = new Date('2026-11-06T15:00:00Z')
const kpiValue = (list: { id: string; value: number | null }[], id: string) => list.find((item) => item.id === id)?.value

describe('totais das execuções (OPE-141)', () => {
  it('conta só quem tem registro: custo ausente não vira 0, tokens contam com entrada OU saída', () => {
    expect(runTotals([{ ok: true, costUsd: null, inputTokens: null, outputTokens: 50, durationMs: null }, { ok: false, costUsd: 0.5, inputTokens: 100, outputTokens: null, durationMs: 60_000 }, { ok: true }])).toEqual({
      runs: 3,
      failures: 1,
      costSum: 0.5,
      costCount: 1,
      tokenSum: 150,
      tokenCount: 2,
      durationSum: 60_000,
      durationCount: 1,
    })
    expect(runTotals([{ ok: true }])).toMatchObject({ costCount: 0, tokenCount: 0, durationCount: 0 })
  })
})

describe('getAgentMetrics liga os KPIs das execuções (OPE-141)', () => {
  beforeEach(() => {
    mocks.find.mockClear()
    mocks.rows = [
      { ok: true, costUsd: 0.25, inputTokens: 1000, outputTokens: 500, durationMs: 120_000 },
      { ok: false, costUsd: null, inputTokens: null, outputTokens: null, durationMs: null },
    ]
  })

  it('consulta as execuções do agente no período (sem as excluídas) e devolve runKpis com "—" onde falta registro', async () => {
    const result = await getAgentMetrics('desenvolvedor', agentMetricsQuerySchema.parse({}), NOW)
    const filter = mocks.find.mock.calls.map(([value]) => value as Record<string, unknown>).find((value) => value.agent === 'desenvolvedor' && 'excluded' in value)
    expect(filter).toMatchObject({ agent: 'desenvolvedor', excluded: { $ne: true }, finishedAt: { $gte: expect.any(Date), $lte: expect.any(Date) } })
    expect(result.runKpis.map((item) => item.id)).toEqual(['runs', 'run-failures', 'run-cost', 'run-tokens', 'run-duration'])
    expect(kpiValue(result.runKpis, 'runs')).toBe(2)
    expect(kpiValue(result.runKpis, 'run-failures')).toBe(50)
    expect(kpiValue(result.runKpis, 'run-cost')).toBe(0.25)
    expect(kpiValue(result.runKpis, 'run-tokens')).toBe(1500)
    expect(kpiValue(result.runKpis, 'run-duration')).toBe(2)
  })

  it('aplica RUN_KPIS_COVERED: o Revisor não repete Duração média nem % de falhas', async () => {
    const result = await getAgentMetrics('revisor', agentMetricsQuerySchema.parse({}), NOW)
    expect(result.runKpis.map((item) => item.id)).toEqual(['runs', 'run-cost', 'run-tokens'])
    expect(result.kpis.map((item) => item.id)).toEqual(['duration'])
  })
})
