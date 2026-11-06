import { describe, expect, it } from 'vitest'
import { runKpis, type RunTotals } from '@/features/agent-metrics/logic/common'
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
