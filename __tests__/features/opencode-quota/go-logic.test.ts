import { describe, expect, it } from 'vitest'
import {
  buildGoChart,
  dateKeysBetween,
  dayPercentFromModels,
  displayDateKey,
  formatGoDate,
  formatGoDateTime,
  goConsoleStatusMessage,
  goCycles,
  goForecast,
  goYMax,
  meterPercent,
  subUtcMonths,
  type GoDayValue,
} from '@/features/opencode-quota/go-logic'

const START = Date.parse('2026-11-05T12:15:35.000Z')
const END = Date.parse('2026-12-05T12:15:35.000Z')
const NOW = Date.parse('2026-11-16T19:57:00.000Z')
const DAY = 86_400_000

const days = (entries: Record<string, number | null>, partial: string[] = []) =>
  new Map<string, GoDayValue>(Object.entries(entries).map(([key, percent]) => [key, { percent, partial: partial.includes(key) }]))

describe('medidor da assinatura OpenCode Go', () => {
  it('converte micro-cents em % com uma casa, truncado como o Console', () => {
    expect(meterPercent(2634252498, 6000000000)).toBe(43.9)
    expect(meterPercent(168599483, 3000000000)).toBe(5.6)
    expect(meterPercent(6000000000, 6000000000)).toBe(100)
    expect(meterPercent(5999999999, 6000000000)).toBe(99.9)
    expect(meterPercent(10, 0)).toBe(0)
  })

  it('soma os pontos percentuais do dia pela cota de cada modelo e marca o dia parcial sem cota', () => {
    const allowances = new Map<string, number | null>([['deepseek-v4.1-flash', 100], ['glm-5.3', 15], ['beam-free', null]])
    const day = dayPercentFromModels(
      [
        { model: 'deepseek-v4.1-flash', costMicroCents: 381216183 },
        { model: 'glm-5.3', costMicroCents: 15_000_000 },
        { model: 'beam-free', costMicroCents: 0 },
      ],
      allowances,
    )
    expect(day.percent).toBeCloseTo(3.81216183 + 1, 6)
    expect(day.partial).toBe(false)
    expect(dayPercentFromModels([{ model: 'desconhecido', costMicroCents: 100 }], allowances)).toEqual({ percent: 0, partial: true })
  })
})

describe('previsão linear', () => {
  it('projeta acima de 100% com a data de cruzamento e a média diária', () => {
    const elapsed = NOW - START
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 43.9 })
    expect(forecast.limitReached).toBe(false)
    expect(forecast.projectedPercent).toBeCloseTo((43.9 * (END - START)) / elapsed, 6)
    expect(forecast.projectedPercent!).toBeGreaterThan(100)
    expect(forecast.crossesAtMs).toBeCloseTo(START + (elapsed * 100) / 43.9, 0)
    expect(forecast.dailyAverage).toBeCloseTo((43.9 * DAY) / elapsed, 6)
  })

  it('prevê abaixo de 100% sem cruzamento', () => {
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 20 })
    expect(forecast.projectedPercent!).toBeLessThan(100)
    expect(forecast.crossesAtMs).toBeNull()
  })

  it('com o mês em 100% não há previsão (limite atingido)', () => {
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 100 })
    expect(forecast).toMatchObject({ limitReached: true, projectedPercent: null, crossesAtMs: null })
  })

  it('só prevê depois de 1 dia de ciclo', () => {
    const early = goForecast({ startMs: START, endMs: END, nowMs: START + DAY - 1, percent: 5 })
    expect(early.projectedPercent).toBeNull()
    expect(early.dailyAverage).not.toBeNull()
    expect(goForecast({ startMs: START, endMs: END, nowMs: START + DAY, percent: 5 }).projectedPercent).not.toBeNull()
  })
})

describe('ciclos da assinatura', () => {
  it('volta mês a mês em UTC, limitando o dia ao fim do mês', () => {
    expect(new Date(subUtcMonths(START, 1)).toISOString()).toBe('2026-10-05T12:15:35.000Z')
    expect(new Date(subUtcMonths(Date.parse('2026-03-31T10:00:00Z'), 1)).toISOString()).toBe('2026-02-28T10:00:00.000Z')
  })

  it('lista os ciclos que cruzam o período, do mais antigo ao atual', () => {
    const cycles = goCycles({ startMs: START, endMs: END }, Date.parse('2026-09-20T00:00:00Z'), Date.parse('2026-11-16T23:59:59Z'))
    expect(cycles.map((cycle) => new Date(cycle.startMs).toISOString().slice(0, 10))).toEqual(['2026-09-05', '2026-10-05', '2026-11-05'])
    expect(cycles.map((cycle) => cycle.current)).toEqual([false, false, true])
    expect(cycles[0]!.endMs).toBe(cycles[1]!.startMs)
  })
})

describe('gráfico do consumo', () => {
  // Período começando depois do início do ciclo: só o ciclo atual entra.
  const current = goCycles({ startMs: START, endMs: END }, Date.parse('2026-11-05T13:00:00Z'), Date.parse('2026-11-16T23:59:59Z'))

  it('o período que começa antes da renovação inclui o ciclo anterior', () => {
    expect(goCycles({ startMs: START, endMs: END }, Date.parse('2026-11-05T00:00:00Z'), NOW)).toHaveLength(2)
    expect(current).toHaveLength(1)
  })

  it('pró-rateia o primeiro dia, usa o medidor na ponta de hoje e desenha a previsão até a renovação', () => {
    const series: Record<string, number> = {}
    for (const key of dateKeysBetween('2026-11-05', '2026-11-16')) series[key] = 4
    const monthRatio = 43.9
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: monthRatio })
    const chart = buildGoChart({ fromKey: '2026-11-05', toKey: '2026-11-16', nowMs: NOW, cycles: current, days: days(series), monthRatio, forecast, historyFrom: '2026-10-05' })

    const first = chart.points[0]!
    const before = (START - Date.parse('2026-11-05T00:00:00Z')) / DAY
    expect(first.date).toBe('2026-11-05')
    expect(first.usage).toBeCloseTo(4 * (1 - before), 2)
    const today = chart.points.find((point) => point.date === '2026-11-16')!
    expect(today.usage).toBe(43.9)
    expect(today.forecast).toBe(43.9)
    expect(chart.points.at(-1)!.date).toBe('2026-12-05')
    expect(chart.forecastEnd).toMatchObject({ date: '2026-12-05', percent: Math.round(forecast.projectedPercent! * 10) / 10 })
    expect(chart.crossing?.date).toBe(new Date(forecast.crossesAtMs!).toISOString().slice(0, 10))
    expect(chart.crossing?.value).toBe(100)
    expect(chart.ceilings).toEqual([{ from: '2026-11-05', to: '2026-12-05', value: 100, current: true }])
    expect(chart.yMax).toBe(150)
    expect(chart.missingDays).toBe(0)
  })

  it('acumula através dos ciclos com o teto relativo e quebra a linha nos dias sem dados', () => {
    const from = Date.parse('2026-10-06T00:00:00Z')
    const cycles = goCycles({ startMs: START, endMs: END }, from, Date.parse('2026-11-16T23:59:59Z'))
    const series: Record<string, number | null> = {}
    for (const key of dateKeysBetween('2026-10-05', '2026-11-16')) series[key] = 2
    series['2026-10-10'] = null
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 40 })
    const chart = buildGoChart({ fromKey: '2026-10-06', toKey: '2026-11-16', nowMs: NOW, cycles, days: days(series), monthRatio: 40, forecast, historyFrom: '2026-10-05' })

    expect(chart.points.find((point) => point.date === '2026-10-10')!.usage).toBeNull()
    expect(chart.missingDays).toBe(1)
    expect(chart.ceilings).toHaveLength(2)
    // O acumulado começa no início do ciclo (05/10), antes do filtro; o eixo começa no filtro.
    expect(chart.points[0]!.date).toBe('2026-10-06')
    expect(chart.ceilings[0]).toMatchObject({ from: '2026-10-06', value: 100, current: false })
    const fraction = (START - Date.parse('2026-11-05T00:00:00Z')) / DAY
    // Ciclo anterior: 2 pp/dia de 05/10 (pró-rateado) a 05/11 (parte anterior), sem o dia que faltou (conta 0).
    const previousCycle = 2 * (1 - fraction) + 2 * 29 + 2 * fraction
    expect(chart.ceilings[1]!.value).toBeCloseTo(previousCycle + 100, 1)
    expect(chart.points.find((point) => point.date === '2026-11-16')!.usage).toBeCloseTo(previousCycle + 40, 1)
    expect(chart.yMax).toBeGreaterThan(150)
    expect(chart.yMax % 50).toBe(0)
  })

  it('o marcador do cruzamento fica no balde UTC, rotulado com a data de São Paulo (fronteira 00h–03h UTC)', () => {
    // 43,9% em ~11,3 dias: escolhe o % que cruza às 01:30 UTC de 01/12 (22:30 de 30/11 em São Paulo).
    const crossesAt = Date.parse('2026-12-01T01:30:00.000Z')
    const percent = ((NOW - START) * 100) / (crossesAt - START)
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent })
    const chart = buildGoChart({ fromKey: '2026-11-06', toKey: '2026-11-16', nowMs: NOW, cycles: current, days: days({}), monthRatio: percent, forecast, historyFrom: '2026-10-05' })
    expect(chart.crossing).toMatchObject({ date: '2026-12-01', label: '30/11' })
    expect(formatGoDate(new Date(forecast.crossesAtMs!).toISOString())).toBe(chart.crossing!.label)
  })

  it('sem previsão quando o mês está em 100%', () => {
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 100 })
    const chart = buildGoChart({ fromKey: '2026-11-05', toKey: '2026-11-16', nowMs: NOW, cycles: current, days: days({}), monthRatio: 100, forecast, historyFrom: '2026-10-05' })
    expect(chart.forecastEnd).toBeNull()
    expect(chart.crossing).toBeNull()
    expect(chart.points.every((point) => point.forecast === null)).toBe(true)
    expect(chart.points.find((point) => point.date === '2026-11-16')!.usage).toBe(100)
  })

  it('período no passado não estende o eixo nem usa o medidor', () => {
    const cycles = goCycles({ startMs: START, endMs: END }, Date.parse('2026-10-10T00:00:00Z'), Date.parse('2026-10-20T23:59:59Z'))
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 40 })
    const chart = buildGoChart({ fromKey: '2026-10-10', toKey: '2026-10-20', nowMs: NOW, cycles, days: days({}), monthRatio: 40, forecast, historyFrom: '2026-10-05' })
    expect(chart.points.at(-1)!.date).toBe('2026-10-20')
    expect(chart.forecastEnd).toBeNull()
  })

  it('eixo Y: 150% ou o próximo múltiplo de 50', () => {
    expect(goYMax([10, 120])).toBe(150)
    expect(goYMax([151])).toBe(200)
  })
})

describe('exibição e mensagens', () => {
  it('datas no fuso de São Paulo', () => {
    expect(formatGoDateTime('2026-12-05T12:15:35.000Z')).toBe('05/12 às 09:15')
    expect(formatGoDate('2026-12-01T02:00:00.000Z')).toBe('30/11')
    expect(displayDateKey(Date.parse('2026-11-17T02:59:59.999Z'))).toBe('2026-11-16')
  })

  it('mensagens por status do Console', () => {
    expect(goConsoleStatusMessage(401)).toMatch(/recusou a chave/)
    expect(goConsoleStatusMessage(403, 'error code: 1010')).toMatch(/Cloudflare/)
    expect(goConsoleStatusMessage(403, '{"_tag":"Forbidden"}')).toMatch(/não tem acesso/)
    expect(goConsoleStatusMessage(404)).toMatch(/HTTP 404/)
  })
})
