import { describe, expect, it } from 'vitest'
import * as go from "@/features/opencode-quota/go-logic"
import { buildCycleChart, cycleAxisTicks, cycleForecast, cycleYMax, cycleYTicks, formatUsageDate, usageStatusLine } from "@nandobfer/integracoes/modules/integrations/ia/features/subscription-usage/cycle-logic"

/**
 * OPE-190: regras do gráfico de ciclo extraídas do OpenCode Go para o módulo compartilhado (usado também pelo
 * Command Code). Os casos detalhados continuam em `go-logic.test.ts`, que passa pelos nomes antigos reexportados.
 */

const DAY = 86_400_000

describe('cycle-logic (compartilhado)', () => {
  it('o OpenCode Go usa as mesmas funções (sem cópia): os nomes antigos são reexportações', () => {
    expect(go.buildGoChart).toBe(buildCycleChart)
    expect(go.goForecast).toBe(cycleForecast)
    expect(go.goYTicks).toBe(cycleYTicks)
    expect(go.goAxisTicks).toBe(cycleAxisTicks)
  })

  it('teto do eixo Y e marcas adaptativas com o 100% fixo', () => {
    expect(cycleYMax([96])).toBe(110)
    expect(cycleYMax([113])).toBe(120)
    expect(cycleYTicks(120)).toEqual([0, 50, 100, 120])
    expect(cycleYTicks(490)).toEqual([0, 100, 200, 300, 400, 490])
  })

  it('previsão linear só depois de 1 dia, com cruzamento antes da renovação', () => {
    const startMs = Date.parse('2026-11-05T12:00:00Z')
    expect(cycleForecast({ startMs, endMs: startMs + 30 * DAY, nowMs: startMs + DAY / 2, percent: 5 }).projectedPercent).toBeNull()
    const forecast = cycleForecast({ startMs, endMs: startMs + 30 * DAY, nowMs: startMs + 10 * DAY, percent: 50 })
    expect(forecast.projectedPercent).toBe(150)
    expect(forecast.crossesAtMs).toBe(startMs + 20 * DAY)
  })

  it('gráfico de um ciclo: nasce em 0, termina em "agora" com o medidor e o dia sem dados quebra a linha', () => {
    const startMs = Date.parse('2026-11-05T00:00:00Z')
    const nowMs = Date.parse('2026-11-08T12:00:00Z')
    const days = new Map([
      ['2026-11-05', { percent: 2, partial: false }],
      ['2026-11-07', { percent: 3, partial: false }],
    ])
    const chart = buildCycleChart({ cycle: { startMs, endMs: startMs + 30 * DAY, current: true }, nowMs, days, monthRatio: 6, forecast: cycleForecast({ startMs, endMs: startMs + 30 * DAY, nowMs, percent: 6 }), historyFrom: '2026-11-05' })
    expect(chart.points.slice(0, 5).map((point) => point.usage)).toEqual([0, 2, null, 5, 6])
    expect(chart.missingDays).toBe(1)
    expect(chart.today).toEqual({ t: nowMs, percent: 6 })
  })

  it('linha de status do cabeçalho: limite atingido, cruzamento ou % previsto', () => {
    expect(usageStatusLine({ limitReached: true, forecast: null })).toEqual({ text: 'Limite mensal atingido', tone: 'destructive' })
    expect(usageStatusLine({ limitReached: false, forecast: { crossesAt: '2026-12-01T12:00:00Z', projectedPercent: 116 } })?.text).toBe(`No ritmo atual, atinge o limite em ${formatUsageDate('2026-12-01T12:00:00Z')}`)
    expect(usageStatusLine({ limitReached: false, forecast: { crossesAt: null, projectedPercent: 80 } })).toEqual({ text: 'Previsão de 80,0% até a renovação', tone: 'muted' })
  })
})
