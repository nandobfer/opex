import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'

/**
 * OPE-203: custos das execuções do motor Opex a partir dos passos gravados — estimativa do histórico gravada uma vez
 * (marcada "estimado"), Parcial com o modelo sem preço, médias por execução e por dia e a mesma agregação na lista
 * de agentes e na Visão geral.
 */

type Row = { _id: Types.ObjectId; subject: string; provider: string; model: string; apiKeyId: string | null; inputTokens: number | null; outputTokens: number | null; costUsd: number | null; billing: unknown; listCost?: unknown; createdAt: Date }

const mocks = vi.hoisted(() => ({ rows: [] as unknown[], writes: [] as unknown[], pricerCalls: 0 }))

vi.mock('@nandobfer/integracoes/modules/integrations/ia/models/AiConsumption', () => ({
  AiConsumption: {
    find: () => ({ select: () => ({ lean: async () => (mocks.rows as Row[]).map((item) => ({ ...item })) }) }),
    bulkWrite: async (ops: { updateOne: { filter: { _id: Types.ObjectId }; update: { $set: { listCost: unknown } } } }[]) => {
      for (const op of ops) {
        mocks.writes.push(op)
        const row = (mocks.rows as Row[]).find((candidate) => String(candidate._id) === String(op.updateOne.filter._id))
        if (row && !row.listCost) row.listCost = op.updateOne.update.$set.listCost
      }
      return {}
    },
  },
}))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/pricing/server', () => ({
  createStepPricer: async ({ model }: { model: string }) => {
    mocks.pricerCalls++
    return {
      price: (tokens: { input: number | null; output: number | null }) =>
        model === 'sem-preco' ? { usd: null, source: 'models.dev', price: null, estimated: false, missingReason: 'sem preço' } : { usd: ((tokens.input ?? 0) + (tokens.output ?? 0)) / 1000, source: 'models.dev', price: null, estimated: false, missingReason: null },
    }
  },
}))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/features/ai-billing/server/billing-context', () => ({
  buildBillingLookup: async () => ({
    key: (id: string) => (id === 'key_cred' ? { keyId: id, name: 'Créditos', provider: 'deepseek', billing: { mode: 'credits', faceValueUsd: 100, paidAmount: 50, paidCurrency: 'USD', startsAt: null, expiresAt: null, exhaustedAt: null } } : null),
    fx: () => 5,
    subscriptionDay: () => ({ kind: 'routine', total: 0 }),
    creditsExhaustedAt: () => null,
  }),
}))

import { computeRunCosts } from '@/features/routine-agents/server/run-costs'
import { aggregateRoutineMetrics } from '@/features/routine-agents/server/run-queries'

const RUN_A = new Types.ObjectId()
const RUN_B = new Types.ObjectId()
const at = new Date('2026-11-04T15:00:00Z')
const row = (subject: Types.ObjectId, extra: Partial<Row> = {}): Row => ({ _id: new Types.ObjectId(), subject: String(subject), provider: 'deepseek', model: 'deepseek-flash', apiKeyId: 'key_cred', inputTokens: 100, outputTokens: 100, costUsd: null, billing: null, createdAt: at, ...extra })
const exact = (usd: number) => ({ usd, source: 'deepseek-table', price: null, estimated: false, missingReason: null })

beforeEach(() => {
  mocks.writes = []
  mocks.pricerCalls = 0
})

describe('custos das execuções', () => {
  it('passos com custo gravado: tabela e efetivo pelo plano (créditos pagos pela metade), em US$ e R$', async () => {
    mocks.rows = [row(RUN_A, { listCost: exact(0.4) }), row(RUN_A, { listCost: exact(0.6) })]
    const { byRun } = await computeRunCosts([String(RUN_A)])
    expect(byRun.get(String(RUN_A))).toMatchObject({ listUsd: 1, effectiveUsd: 0.5, savingsUsd: 0.5, listBrl: 5, effectiveBrl: 2.5, partial: false, estimated: false })
    expect(mocks.pricerCalls).toBe(0)
  })

  it('histórico sem custo de tabela: estimado pelos tokens, marcado e gravado uma vez só', async () => {
    mocks.rows = [row(RUN_A, { apiKeyId: null })]
    const first = await computeRunCosts([String(RUN_A)])
    expect(first.byRun.get(String(RUN_A))).toMatchObject({ listUsd: 0.2, effectiveUsd: 0.2, estimated: true })
    expect(mocks.writes).toHaveLength(1)
    const second = await computeRunCosts([String(RUN_A)])
    expect(second.byRun.get(String(RUN_A))?.estimated).toBe(true)
    expect(mocks.writes).toHaveLength(1)
  })

  it('modelo sem preço: total Parcial com o modelo indicado; motor OpenCode fica de fora', async () => {
    mocks.rows = [row(RUN_B, { model: 'sem-preco', listCost: undefined }), row(RUN_B, { listCost: exact(1) }), row(RUN_B, { provider: 'opencode', listCost: undefined })]
    const { byRun, steps } = await computeRunCosts([String(RUN_B)])
    expect(byRun.get(String(RUN_B))).toMatchObject({ listUsd: 1, partial: true, missingPrices: ['deepseek/sem-preco'] })
    expect(steps).toHaveLength(2)
  })
})

describe('métricas com custo', () => {
  it('KPIs de custo, médias por execução, dia corrido e dia com execução, gráfico por dia e divisão', async () => {
    mocks.rows = [row(RUN_A, { listCost: exact(1) }), row(RUN_B, { listCost: exact(3), apiKeyId: null })]
    const costs = await computeRunCosts([String(RUN_A), String(RUN_B)])
    const runs = [
      { _id: RUN_A, status: 'completed', activeMs: 1000, tokens: 200, costUsd: null, costPartial: false, createdAt: at, snapshot: { engine: 'opex' } },
      { _id: RUN_B, status: 'completed', activeMs: 1000, tokens: 200, costUsd: null, costPartial: false, createdAt: at, snapshot: { engine: 'opex' } },
      { _id: new Types.ObjectId(), status: 'completed', activeMs: 1000, tokens: 50, costUsd: null, costPartial: false, createdAt: at, snapshot: { engine: 'opencode' } },
    ] as never
    const range = { from: new Date('2026-11-01T03:00:00Z'), to: new Date('2026-11-05T02:59:59Z') }
    const metrics = aggregateRoutineMetrics(runs, range, null, costs)
    expect(metrics.cost.totals).toMatchObject({ listUsd: 4, effectiveUsd: 3.5, savingsUsd: 0.5 })
    expect(metrics.cost).toMatchObject({ runsWithCost: 2, calendarDays: 4, activeDays: 1, perRun: { listUsd: 2, effectiveUsd: 1.75 }, perCalendarDay: { listUsd: 1 }, perActiveDay: { listUsd: 4 } })
    expect(metrics.days.find((day) => day.day === '2026-11-04')!.cost).toMatchObject({ listUsd: 4, effectiveUsd: 3.5 })
    expect(metrics.days.find((day) => day.day === '2026-11-03')!.cost.listUsd).toBeNull()
    expect(metrics.breakdown.plans.map((item) => item.label)).toEqual(['DeepSeek · Sem chave identificada · Pago por uso', 'DeepSeek · Créditos · Créditos'])
    expect(metrics.breakdown.models).toEqual([expect.objectContaining({ key: 'deepseek/deepseek-flash', listUsd: 4 })])
  })

  it('execução do motor Opex com tokens mas sem passos gravados: custo desconhecido (Parcial), nunca zero', () => {
    const run = { _id: RUN_A, status: 'completed', activeMs: 1, tokens: 10, costUsd: null, costPartial: false, createdAt: at, snapshot: { engine: 'opex' } } as never
    const metrics = aggregateRoutineMetrics([run], { from: new Date('2026-11-04T03:00:00Z'), to: new Date('2026-11-05T02:59:59Z') }, null)
    expect(metrics.cost.totals).toMatchObject({ listUsd: null, effectiveUsd: null, partial: true })
    expect(metrics.cost.totals.notices[0]).toContain('sem registro de consumo')
  })
})
