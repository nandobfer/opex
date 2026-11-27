import { describe, expect, it } from 'vitest'
import { cacheRatePipeline, runKpis, type RunTotals } from '@/features/agent-metrics/logic/common'
import { runPipeline } from '../../helpers/mongo-pipeline'
import { RUN_KPIS_COVERED } from '@/features/agent-metrics/server/metrics'

const totals = (over: Partial<RunTotals> = {}): RunTotals => ({ runs: 0, failures: 0, costSum: 0, costCount: 0, tokenSum: 0, tokenCount: 0, durationSum: 0, durationCount: 0, ...over })
const value = (list: ReturnType<typeof runKpis>, id: string) => list.find((item) => item.id === id)?.value

describe('KPIs das execuções (OPE-141, porte do runKpis do my-tasks)', () => {
  it('Execuções, % de falhas, Custo e Tokens somados e Duração média em minutos', () => {
    const list = runKpis(totals({ runs: 8, failures: 2, costSum: 1.5, costCount: 4, tokenSum: 12_000, tokenCount: 6, durationSum: 6 * 60_000, durationCount: 3 }))
    expect(list.map((item) => item.label)).toEqual(['Execuções', '% de falhas', 'Custo', 'Tokens', 'Duração média'])
    expect(value(list, 'runs')).toBe(8)
    expect(value(list, 'run-failures')).toBe(25)
    expect(value(list, 'run-cost')).toBe(1.5)
    expect(value(list, 'run-tokens')).toBe(12_000)
    expect(value(list, 'run-duration')).toBe(2)
  })

  it('sem registro de custo, tokens ou duração e sem execuções: "—" (null), nunca 0', () => {
    const list = runKpis(totals())
    expect(value(list, 'runs')).toBe(0)
    expect(value(list, 'run-failures')).toBeNull()
    expect(value(list, 'run-cost')).toBeNull()
    expect(value(list, 'run-tokens')).toBeNull()
    expect(value(list, 'run-duration')).toBeNull()
  })

  it('fica o KPI do agente (decisão do dono): Revisor sem duração e falhas, rotineiros sem execuções e falhas', () => {
    const t = totals({ runs: 3 })
    expect(runKpis(t, RUN_KPIS_COVERED.revisor).map((item) => item.id)).toEqual(['runs', 'run-cost', 'run-tokens'])
    expect(runKpis(t, RUN_KPIS_COVERED.rotineiros).map((item) => item.id)).toEqual(['run-cost', 'run-tokens', 'run-duration'])
    expect(runKpis(t, RUN_KPIS_COVERED.desenvolvedor).map((item) => item.id)).toHaveLength(5)
  })
})

/** O pipeline real (`cacheRatePipeline`, regra única) avaliado localmente; nenhum `$group` devolvido = sem base. */
const cacheTotals = (rows: Record<string, unknown>[]) => {
  const [group] = runPipeline(rows.map((row) => ({ origin: 'agentic', ...row })), cacheRatePipeline({ origin: { $in: ['agentic'] } }))
  return group ? { cacheReadSum: group.cacheReadSum, inputSum: group.inputSum, count: group.count } : { cacheReadSum: 0, inputSum: 0, count: 0 }
}

describe('Taxa de cache (OPE-205)', () => {
  it('só entra na base o registro com o cache lido informado; 0 informado é medição, ausente não é', () => {
    const totals = cacheTotals([
      { inputTokens: 100, tokenDetails: { noCache: 100, cacheRead: 300, cacheWrite: 0 } },
      { inputTokens: 500, tokenDetails: { noCache: null, cacheRead: null, cacheWrite: null } },
      { inputTokens: 900, tokenDetails: null },
      { inputTokens: 1000 },
      { inputTokens: 200, tokenDetails: { noCache: null, cacheRead: 0, cacheWrite: null } },
    ])
    expect(totals).toEqual({ cacheReadSum: 300, inputSum: 600, count: 2 })
  })

  it('entrada pelas partes quando os três vêm informados (OpenCode: inputTokens é sem cache) e pelo inputTokens na falta de alguma', () => {
    // OpenCode: inputTokens 100 é só a entrada sem cache; a entrada real é 100 + 300 + 50 (o cache escrito conta).
    expect(cacheTotals([{ inputTokens: 100, tokenDetails: { noCache: 100, cacheRead: 300, cacheWrite: 50 } }])).toEqual({ cacheReadSum: 300, inputSum: 450, count: 1 })
    // SDK: sem o cache escrito informado, vale o inputTokens (que já é o total), mesmo com o sem cache informado.
    expect(cacheTotals([{ inputTokens: 1000, tokenDetails: { noCache: 700, cacheRead: 250, cacheWrite: null } }])).toEqual({ cacheReadSum: 250, inputSum: 1000, count: 1 })
    expect(cacheTotals([{ inputTokens: 1000, tokenDetails: { noCache: null, cacheRead: 250, cacheWrite: 50 } }])).toEqual({ cacheReadSum: 250, inputSum: 1000, count: 1 })
  })

  it('entrada zerada ou sem total fica fora (não há como dividir)', () => {
    expect(cacheTotals([{ inputTokens: 0, tokenDetails: { noCache: 0, cacheRead: 0, cacheWrite: 0 } }, { inputTokens: null, tokenDetails: { cacheRead: 50 } }, { tokenDetails: { cacheRead: 50 } }])).toEqual({ cacheReadSum: 0, inputSum: 0, count: 0 })
  })

  it('só as origens e o período do `match` entram (outra origem ou fora do intervalo não contam)', () => {
    const from = new Date('2026-11-01T00:00:00Z')
    const to = new Date('2026-11-30T23:59:59Z')
    const rows = [
      { origin: 'agentic', createdAt: new Date('2026-11-10T00:00:00Z'), inputTokens: 100, tokenDetails: { noCache: 50, cacheRead: 50, cacheWrite: 0 } },
      { origin: 'routine-agent', createdAt: new Date('2026-11-10T00:00:00Z'), inputTokens: 100, tokenDetails: { noCache: 0, cacheRead: 100, cacheWrite: 0 } },
      { origin: 'agentic', createdAt: new Date('2026-10-10T00:00:00Z'), inputTokens: 100, tokenDetails: { noCache: 0, cacheRead: 100, cacheWrite: 0 } },
    ]
    expect(runPipeline(rows, cacheRatePipeline({ origin: { $in: ['agentic'] }, createdAt: { $gte: from, $lte: to } }))).toEqual([{ _id: null, cacheReadSum: 50, inputSum: 100, count: 1 }])
  })

  it('cartão "Taxa de cache" logo depois de Tokens, com "—" sem base e "Dados desde" do marcador', () => {
    const withCache = runKpis(totals({ runs: 2 }), [], { totals: { cacheReadSum: 300, inputSum: 1000, count: 2 }, since: '2026-11-27T00:00:00.000Z' })
    expect(withCache.map((item) => item.id)).toEqual(['runs', 'run-failures', 'run-cost', 'run-tokens', 'run-cache-rate', 'run-duration'])
    expect(value(withCache, 'run-cache-rate')).toBe(30)
    expect(withCache.find((item) => item.id === 'run-cache-rate')).toMatchObject({ format: 'percent', since: '2026-11-27T00:00:00.000Z' })

    const withoutBase = runKpis(totals({ runs: 2 }), [], { totals: { cacheReadSum: 0, inputSum: 0, count: 0 }, since: null })
    expect(value(withoutBase, 'run-cache-rate')).toBeNull()
    // Sem o bloco de cache (chamada antiga), o cartão não aparece.
    expect(value(runKpis(totals({ runs: 2 })), 'run-cache-rate')).toBeUndefined()
  })
})
