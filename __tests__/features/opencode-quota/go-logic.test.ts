import { describe, expect, it } from 'vitest'
import {
  axisDateLabel,
  buildGoChart,
  combineGoDays,
  dateKeysBetween,
  dayPercentFromModels,
  formatGoDate,
  formatGoDateTime,
  formatGoFullDate,
  goAxisTicks,
  goConsoleStatusMessage,
  goCycleFor,
  goForecast,
  goKeyLabel,
  goPreCycleDayKeys,
  goPreCycleRatio,
  goReferenceIndex,
  goSharedKeyGroups,
  groupGoSubscriptions,
  goYMax,
  goYTicks,
  meterPercent,
  subUtcMonths,
  sumGoMeters,
  type GoDayValue,
} from "@nandobfer/integracoes/modules/integrations/ia/features/opencode-quota/go-logic"
import type { GoStatus } from "@nandobfer/integracoes/modules/integrations/ia/features/opencode-quota/go-schemas"

const goStatus = (overrides: { used?: number; limit?: number; startsAt?: string; endsAt?: string; fiveHourReset?: string | null } = {}): GoStatus => ({
  product: 'go',
  access: {
    startsAt: overrides.startsAt ?? '2026-11-05T12:15:35.000Z',
    endsAt: overrides.endsAt ?? '2026-12-05T12:15:35.000Z',
    meters: {
      fiveHour: { resetsAt: overrides.fiveHourReset === undefined ? '2026-11-16T22:00:00.000Z' : overrides.fiveHourReset, limitMicroCents: 1_200_000_000, usedMicroCents: 37_061_887 },
      week: { resetsAt: '2026-11-23T00:00:00.000Z', limitMicroCents: 3_000_000_000, usedMicroCents: 168_599_483 },
      month: { resetsAt: overrides.endsAt ?? '2026-12-05T12:15:35.000Z', limitMicroCents: overrides.limit ?? 6_000_000_000, usedMicroCents: overrides.used ?? 2_634_252_498 },
    },
  },
})

describe('soma das assinaturas em "Todas as chaves" (OPE-180)', () => {
  it('soma uso e limite com o % truncado sobre a soma; com uma assinatura é o próprio medidor', () => {
    const one = sumGoMeters([goStatus()])
    expect(meterPercent(one.month.usedMicroCents, one.month.limitMicroCents)).toBe(43.9)
    const two = sumGoMeters([goStatus(), goStatus({ used: 1_365_747_502 })])
    expect(two.month).toMatchObject({ usedMicroCents: 4_000_000_000, limitMicroCents: 12_000_000_000 })
    expect(meterPercent(two.month.usedMicroCents, two.month.limitMicroCents)).toBe(33.3)
  })

  it('o reset de cada janela é o mais próximo, ignorando os nulos', () => {
    const sum = sumGoMeters([goStatus({ fiveHourReset: null }), goStatus({ fiveHourReset: '2026-11-16T21:00:00.000Z' }), goStatus({ fiveHourReset: '2026-11-16T23:00:00.000Z' })])
    expect(sum.fiveHour.resetsAt).toBe('2026-11-16T21:00:00.000Z')
    expect(sumGoMeters([goStatus({ fiveHourReset: null })]).fiveHour.resetsAt).toBeNull()
  })

  it('referência: renovação mais próxima; empate pela maior cota, depois a principal, depois o nome', () => {
    const sub = (name: string, status: GoStatus, primary = false) => ({ name, status, primary })
    expect(goReferenceIndex([sub('A', goStatus()), sub('B', goStatus({ endsAt: '2026-11-28T08:00:00.000Z' }))])).toBe(1)
    expect(goReferenceIndex([sub('A', goStatus()), sub('B', goStatus({ limit: 9_000_000_000 }))])).toBe(1)
    expect(goReferenceIndex([sub('A', goStatus()), sub('B', goStatus(), true)])).toBe(1)
    expect(goReferenceIndex([sub('Z', goStatus()), sub('B', goStatus())])).toBe(1)
    expect(goReferenceIndex([sub('A', goStatus())])).toBe(0)
  })

  it('agrupa pela identidade estável (ciclo e limites): uso e resets diferentes são a mesma assinatura lida em outro instante', () => {
    const groups = groupGoSubscriptions([
      { id: 1, status: goStatus() },
      { id: 2, status: goStatus({ startsAt: '2026-11-05T12:15:36.000Z' }) },
      { id: 3, status: goStatus({ used: 2_700_000_000, fiveHourReset: '2026-11-16T23:00:00.000Z' }) },
      { id: 4, status: goStatus({ limit: 9_000_000_000 }) },
    ])
    expect(groups.map((group) => group.map((item) => item.id))).toEqual([[1, 3], [2], [4]])
  })

  it('uso antes do próprio ciclo dentro da referência: pró-rateia as pontas e conta 0 sem dados', () => {
    const series = days({ '2026-10-28': 3, '2026-10-29': 3, '2026-10-30': null, '2026-10-31': 3 })
    // De 28/10 12:00 a 31/10 06:00: meio dia + 1 dia + (sem dados) + um quarto de dia.
    expect(goPreCycleRatio(series, Date.parse('2026-10-28T12:00:00.000Z'), Date.parse('2026-10-31T06:00:00.000Z'))).toBeCloseTo(1.5 + 3 + 0.75, 10)
    expect(goPreCycleRatio(series, START, START)).toBe(0)
    expect(goPreCycleRatio(null, 0, START)).toBe(0)
    expect(goPreCycleDayKeys(Date.parse('2026-10-28T12:00:00.000Z'), Date.parse('2026-10-31T00:00:00.000Z'))).toEqual(['2026-10-28', '2026-10-29', '2026-10-30'])
  })

  it('combina os dias pela cota mensal: nulo sem dados de nenhuma, incompleto sem dados de alguma, parcial propagado', () => {
    const dates = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']
    const a = days({ '2026-11-10': 3, '2026-11-11': null, '2026-11-12': 4, '2026-11-13': 2 }, ['2026-11-13'])
    const b = days({ '2026-11-10': 6, '2026-11-11': null, '2026-11-12': null, '2026-11-13': 2 })
    const combined = combineGoDays([{ days: a, weight: 1 }, { days: b, weight: 2 }], dates)
    expect(combined.get('2026-11-10')).toEqual({ percent: 5, partial: false })
    expect(combined.get('2026-11-11')).toEqual({ percent: null, partial: false })
    expect(combined.get('2026-11-12')!.percent).toBeCloseTo(4 / 3, 10)
    expect(combined.get('2026-11-12')!.incomplete).toBe(true)
    expect(combined.get('2026-11-13')).toEqual({ percent: 2, partial: true })
    // Assinatura sem série (catálogo indisponível) conta 0 e deixa os dias incompletos.
    expect(combineGoDays([{ days: a, weight: 1 }, { days: null, weight: 1 }], ['2026-11-10']).get('2026-11-10')).toEqual({ percent: 1.5, partial: false, incomplete: true })
    // Uma só assinatura: a própria série.
    expect(combineGoDays([{ days: a, weight: 5 }], dates).get('2026-11-10')).toEqual({ percent: 3, partial: false })
  })

  it('o gráfico conta os dias de cobertura incompleta', () => {
    const input = new Map<string, GoDayValue>([
      ['2026-11-06', { percent: 2, partial: false, incomplete: true }],
      ['2026-11-07', { percent: 2, partial: false }],
    ])
    const chart = buildGoChart({ cycle: { startMs: START, endMs: END, current: true }, nowMs: NOW, days: input, monthRatio: 43.9, forecast: goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 43.9 }), historyFrom: '2026-10-05' })
    expect(chart.incompleteDays).toBe(1)
  })

  it('rótulo das chaves e grupos de chaves da mesma assinatura', () => {
    const scope = (keys: [string, number][], subscriptions: number) => ({ mode: 'all' as const, keys: keys.map(([name, subscription]) => ({ name, subscription })), subscriptions, failed: [], cycleKeyName: null, cyclesDiffer: false })
    expect(goKeyLabel(null, 'Pessoal')).toBe('Chave: Pessoal')
    expect(goKeyLabel(null, null)).toBeNull()
    expect(goKeyLabel(scope([['Pessoal', 0]], 1), null)).toBe('Chave: Pessoal')
    expect(goKeyLabel(scope([['A', 0], ['B', 1], ['C', 2]], 3), null)).toBe('Chaves: 3')
    expect(goKeyLabel(scope([['A', 0], ['B', 0], ['C', 1]], 2), null)).toBe('Chaves: 3 (2 assinaturas)')
    expect(goKeyLabel(scope([['A', 0], ['B', 0]], 1), null)).toBe('Chaves: 2 (1 assinatura)')
    expect(goSharedKeyGroups(scope([['A', 0], ['B', 0], ['C', 1]], 2))).toEqual([['A', 'B']])
    expect(goSharedKeyGroups(null)).toEqual([])
  })
})

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

  it('um ciclo por vez: o atual quando o fim do filtro o alcança; senão o anterior que contém o fim', () => {
    // Padrão "Último mês" visto em 16/11: 16/10 → fim do dia 16/11 em São Paulo.
    expect(goCycleFor({ startMs: START, endMs: END }, Date.parse('2026-11-17T02:59:59.999Z'))).toEqual({ startMs: START, endMs: END, current: true })
    const past = goCycleFor({ startMs: START, endMs: END }, Date.parse('2026-10-20T23:59:59Z'))
    expect(new Date(past.startMs).toISOString()).toBe('2026-10-05T12:15:35.000Z')
    expect(past).toMatchObject({ endMs: START, current: false })
    expect(new Date(goCycleFor({ startMs: START, endMs: END }, Date.parse('2026-09-30T00:00:00Z')).startMs).toISOString()).toBe('2026-09-05T12:15:35.000Z')
  })
})

describe('gráfico do consumo (um ciclo, desenho do Console)', () => {
  const cycle = { startMs: START, endMs: END, current: true }
  const everyDay = (value: number) => {
    const series: Record<string, number> = {}
    for (const key of dateKeysBetween('2026-11-05', '2026-11-16')) series[key] = value
    return series
  }

  it('nasce em 0% no início do ciclo, pró-rateia o primeiro dia e termina em agora com o medidor (regressão: nada do ciclo anterior)', () => {
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 44.3 })
    const chart = buildGoChart({ cycle, nowMs: NOW, days: days(everyDay(4)), monthRatio: 44.3, forecast, historyFrom: '2026-10-05' })

    expect(chart.points[0]).toMatchObject({ t: START, usage: 0 })
    const before = (START - Date.parse('2026-11-05T00:00:00Z')) / DAY
    expect(chart.points[1]).toMatchObject({ t: Date.parse('2026-11-06T00:00:00Z'), date: '2026-11-05' })
    expect(chart.points[1]!.usage).toBeCloseTo(4 * (1 - before), 2)
    // O uso do dia da dica é o mesmo pedaço pró-rateado (não o balde UTC cheio), igual ao acumulado do 1º dia.
    expect(chart.points[1]!.dayPercent).toBe(chart.points[1]!.usage)
    expect(chart.points[2]!.dayPercent).toBe(4)
    const today = chart.points.find((point) => point.t === NOW)!
    expect(today.usage).toBe(44.3)
    expect(chart.today).toEqual({ t: NOW, percent: 44.3 })
    expect(Math.max(...chart.points.map((point) => point.usage ?? 0))).toBeLessThan(50)
    expect(chart.cycle).toEqual({ startsAt: '2026-11-05T12:15:35.000Z', endsAt: '2026-12-05T12:15:35.000Z', current: true })
    // OPE-171: previsão de ~116% → eixo até 120%, não 150%.
    expect(chart.yMax).toBe(120)
    expect(chart.yMax).toBeGreaterThan(chart.forecastEnd!.percent)
    expect(chart.missingDays).toBe(0)
  })

  it('previsão é a reta de agora até a renovação, um ponto por dia, com cruzamento no teto de 100%', () => {
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 44.3 })
    const chart = buildGoChart({ cycle, nowMs: NOW, days: days(everyDay(4)), monthRatio: 44.3, forecast, historyFrom: '2026-10-05' })
    const forecastPoints = chart.points.filter((point) => point.forecast !== null)
    // Agora (16/11 19:57) + fim de cada dia UTC de 16/11 a 04/12 + a renovação (05/12 12:15).
    expect(forecastPoints[0]!.t).toBe(NOW)
    expect(forecastPoints[0]!.forecast).toBe(44.3)
    expect(forecastPoints.at(-1)!.t).toBe(END)
    expect(forecastPoints.at(-1)!.forecast).toBeCloseTo(forecast.projectedPercent!, 2)
    expect(forecastPoints.slice(1).map((point) => point.date)).toEqual(dateKeysBetween('2026-11-16', '2026-12-05'))
    // Todos sobre a mesma reta: a linha amarela continua reta.
    const slope = (forecastPoints.at(-1)!.forecast! - 44.3) / (END - NOW)
    for (const point of forecastPoints) expect(point.forecast!).toBeCloseTo(44.3 + slope * (point.t - NOW), 1)
    expect(chart.forecastEnd).toEqual({ t: END, percent: Math.round(forecast.projectedPercent! * 10) / 10 })
    expect(chart.crossing).toMatchObject({ t: forecast.crossesAtMs, value: 100 })
    expect(chart.crossing!.label).toBe(formatGoDate(new Date(forecast.crossesAtMs!).toISOString()))
  })

  it('previsão do dia: a média diária num dia inteiro, pró-rateada nas pontas, somando o previsto menos o medidor', () => {
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 44.3 })
    const chart = buildGoChart({ cycle, nowMs: NOW, days: days(everyDay(4)), monthRatio: 44.3, forecast, historyFrom: '2026-10-05' })
    const daily = chart.points.filter((point) => point.dayForecast !== null)
    expect(daily.find((point) => point.date === '2026-11-24')!.dayForecast).toBeCloseTo(forecast.dailyAverage!, 2)
    expect(daily[0]!.date).toBe('2026-11-16')
    expect(daily[0]!.dayForecast!).toBeLessThan(forecast.dailyAverage!)
    // Cada dia vem arredondado em 2 casas: a soma fica a menos de 0,1 do previsto menos o medidor.
    expect(Math.abs(daily.reduce((sum, point) => sum + point.dayForecast!, 0) - (forecast.projectedPercent! - 44.3))).toBeLessThan(0.1)
    // Trecho verde e ponto de agora não têm previsão do dia.
    expect(chart.points.filter((point) => point.usage !== null).every((point) => point.dayForecast === null)).toBe(true)
  })

  it('o rótulo do cruzamento usa a data de São Paulo (fronteira 00h–03h UTC)', () => {
    const crossesAt = Date.parse('2026-12-01T01:30:00.000Z')
    const percent = ((NOW - START) * 100) / (crossesAt - START)
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent })
    const chart = buildGoChart({ cycle, nowMs: NOW, days: days({}), monthRatio: percent, forecast, historyFrom: '2026-10-05' })
    expect(chart.crossing!.label).toBe('30 nov')
  })

  it('dia sem dados quebra a linha e conta 0', () => {
    const series: Record<string, number | null> = everyDay(2)
    series['2026-11-10'] = null
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 30 })
    const chart = buildGoChart({ cycle, nowMs: NOW, days: days(series), monthRatio: 30, forecast, historyFrom: '2026-10-05' })
    expect(chart.points.find((point) => point.date === '2026-11-10')!.usage).toBeNull()
    expect(chart.missingDays).toBe(1)
  })

  it('sem previsão quando o mês está em 100%', () => {
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 100 })
    const chart = buildGoChart({ cycle, nowMs: NOW, days: days({}), monthRatio: 100, forecast, historyFrom: '2026-10-05' })
    expect(chart.forecastEnd).toBeNull()
    expect(chart.crossing).toBeNull()
    expect(chart.points.every((point) => point.forecast === null && point.dayForecast === null)).toBe(true)
    expect(chart.today?.percent).toBe(100)
  })

  it('ciclo passado: termina na renovação com a soma dos dias, sem medidor nem previsão', () => {
    const past = { startMs: Date.parse('2026-10-05T12:15:35.000Z'), endMs: START, current: false }
    const series: Record<string, number> = {}
    for (const key of dateKeysBetween('2026-10-05', '2026-11-05')) series[key] = 1
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 44.3 })
    const chart = buildGoChart({ cycle: past, nowMs: NOW, days: days(series), monthRatio: 44.3, forecast, historyFrom: '2026-10-05' })
    expect(chart.points.at(-1)!.t).toBe(START)
    expect(chart.points.at(-1)!.usage).toBeCloseTo(31, 1)
    // Último dia (05/11 até 12:15) pró-rateado também no uso do dia.
    expect(chart.points.at(-1)!.dayPercent).toBeCloseTo((START - Date.parse('2026-11-05T00:00:00Z')) / DAY, 2)
    expect(chart.today).toBeNull()
    expect(chart.forecastEnd).toBeNull()
    expect(chart.cycle.current).toBe(false)
  })

  it('eixo Y: próximo múltiplo de 10 estritamente acima do maior valor, no mínimo 110%', () => {
    expect(goYMax([10, 113])).toBe(120)
    expect(goYMax([120])).toBe(130)
    expect(goYMax([96])).toBe(110)
    expect(goYMax([10])).toBe(110)
    expect(goYMax([100])).toBe(110)
    expect(goYMax([])).toBe(110)
    expect(goYMax([487.3])).toBe(490)
  })

  it('marcas do eixo Y: passo adaptativo (50, 100, 200, 500…) com no máximo 6 marcas, o 100% e o topo', () => {
    expect(goYTicks(110)).toEqual([0, 50, 100, 110])
    expect(goYTicks(120)).toEqual([0, 50, 100, 120])
    expect(goYTicks(150)).toEqual([0, 50, 100, 150])
    expect(goYTicks(160)).toEqual([0, 50, 100, 160])
    expect(goYTicks(250)).toEqual([0, 50, 100, 150, 200, 250])
    expect(goYTicks(310)).toEqual([0, 100, 200, 310])
    expect(goYTicks(490)).toEqual([0, 100, 200, 300, 400, 490])
    expect(goYTicks(730)).toEqual([0, 100, 200, 400, 600, 730])
    expect(goYTicks(1010)).toEqual([0, 100, 500, 1010])
    // Acima de 1250% o 100% encavalaria com o 0%: sai das marcas (a linha pontilhada do teto continua).
    expect(goYTicks(2500)).toEqual([0, 500, 1000, 1500, 2000, 2500])
    for (const yMax of [110, 130, 200, 210, 340, 490, 510, 730, 1010, 2500, 9990]) {
      const ticks = goYTicks(yMax)
      expect(ticks.length).toBeGreaterThanOrEqual(3)
      expect(ticks.length).toBeLessThanOrEqual(6)
      expect(ticks[0]).toBe(0)
      expect(ticks.at(-1)).toBe(yMax)
      if (yMax <= 1250) expect(ticks).toContain(100)
      expect(new Set(ticks).size).toBe(ticks.length)
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks)
    }
  })

  it('faixa de datas: início, terços, cruzamento destacado e fim, sem encavalar', () => {
    const crossing = Date.parse('2026-12-01T09:34:56Z')
    const ticks = goAxisTicks(START, END, crossing)
    expect(ticks.map((tick) => axisDateLabel(tick.t))).toEqual(['5 NOV', '15 NOV', '25 NOV', '1 DEZ', '5 DEZ'])
    expect(ticks.filter((tick) => tick.highlight).map((tick) => tick.t)).toEqual([crossing])
    // Cruzamento perto do ⅔: o terço sai.
    const near = goAxisTicks(START, END, Date.parse('2026-11-26T12:00:00Z'))
    expect(near.map((tick) => [axisDateLabel(tick.t), tick.highlight])).toEqual([['5 NOV', false], ['15 NOV', false], ['26 NOV', true], ['5 DEZ', false]])
    expect(goAxisTicks(START, END, null)).toHaveLength(4)
  })
})

describe('exibição e mensagens', () => {
  it('datas no fuso de São Paulo', () => {
    expect(formatGoDateTime('2026-12-05T12:15:35.000Z')).toBe('05/12 às 09:15')
    expect(formatGoDate('2026-12-01T02:00:00.000Z')).toBe('30 nov')
    expect(formatGoDate('2026-12-05T12:15:35.000Z')).toBe('5 dez')
    expect(formatGoFullDate(Date.parse('2026-11-17T02:59:59.999Z'))).toBe('16/11/2026')
  })

  it('mensagens por status do Console', () => {
    expect(goConsoleStatusMessage(401)).toMatch(/recusou a chave/)
    expect(goConsoleStatusMessage(403, 'error code: 1010')).toMatch(/Cloudflare/)
    expect(goConsoleStatusMessage(403, '{"_tag":"Forbidden"}')).toMatch(/não tem acesso/)
    expect(goConsoleStatusMessage(404)).toMatch(/HTTP 404/)
  })
})
