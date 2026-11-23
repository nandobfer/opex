import { describe, expect, it } from 'vitest'
import {
  axisDateLabel,
  buildGoChart,
  composeGoDay,
  dateKeysBetween,
  dayPercentFromModels,
  formatGoDate,
  formatGoDateTime,
  formatGoFullDate,
  goAxisTicks,
  goConsoleStatusMessage,
  goCycleFor,
  goForecast,
  goReferenceCycle,
  goYMax,
  goYTicks,
  meterPercent,
  mergeGoModelCosts,
  subUtcMonths,
  sumGoAllowances,
  sumGoMeters,
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

describe('consolidado de várias chaves (OPE-180)', () => {
  const meters = (five: [number, number, string], week: [number, number, string], month: [number, number, string]) => ({
    fiveHour: { usedMicroCents: five[0], limitMicroCents: five[1], resetsAt: five[2] },
    week: { usedMicroCents: week[0], limitMicroCents: week[1], resetsAt: week[2] },
    month: { usedMicroCents: month[0], limitMicroCents: month[1], resetsAt: month[2] },
  })

  it('soma uso e limite de cada janela e calcula o % truncado sobre os totais, com o reset mais próximo', () => {
    const total = sumGoMeters([
      meters([100, 1200, '2026-11-16T22:00:00.000Z'], [300, 3000, '2026-11-23T00:00:00.000Z'], [2634252498, 6000000000, '2026-12-05T12:15:35.000Z']),
      meters([500, 1200, '2026-11-16T20:00:00.000Z'], [0, 3000, '2026-11-25T00:00:00.000Z'], [1000000000, 6000000000, '2026-12-10T00:00:00.000Z']),
    ])
    expect(total.month).toEqual({ usedMicroCents: 3634252498, limitMicroCents: 12000000000, resetsAt: '2026-12-05T12:15:35.000Z' })
    // 3634252498 / 12000000000 = 30,285…% → 30,2% (truncado), um teto único de 100% para as duas assinaturas.
    expect(meterPercent(total.month.usedMicroCents, total.month.limitMicroCents)).toBe(30.2)
    expect(total.fiveHour).toEqual({ usedMicroCents: 600, limitMicroCents: 2400, resetsAt: '2026-11-16T20:00:00.000Z' })
    expect(total.week.resetsAt).toBe('2026-11-23T00:00:00.000Z')
  })

  it('soma custo e cota do mesmo modelo entre as chaves; modelo sem cota em nenhuma continua nulo', () => {
    expect(mergeGoModelCosts([[{ model: 'a', costMicroCents: 100 }, { model: 'b', costMicroCents: 0 }], [{ model: 'a', costMicroCents: 50 }]])).toEqual([{ model: 'a', costMicroCents: 150 }])
    const allowances = sumGoAllowances([new Map([['a', 100], ['free', null]]), new Map<string, number | null>([['a', 200], ['so-b', 15], ['free', null]])])
    expect([...allowances]).toEqual([['a', 300], ['free', null], ['so-b', 15]])
  })

  it('dia consolidado: Σ custo / Σ cota das chaves que responderam; as que faltaram contam em missingKeys', () => {
    const allowances = new Map<string, number | null>([['a', 100]])
    // 2 US$ + 1 US$ sobre 100 + 100 US$ de cota = 1,5 pp (e não 3 pp de uma assinatura só).
    const both = composeGoDay([{ costs: [{ model: 'a', costMicroCents: 200_000_000 }], allowances }, { costs: [{ model: 'a', costMicroCents: 100_000_000 }], allowances }], 2)
    expect(both).toEqual({ percent: 1.5, partial: false })
    const one = composeGoDay([{ costs: [{ model: 'a', costMicroCents: 200_000_000 }], allowances }], 2)
    expect(one).toEqual({ percent: 2, partial: false, missingKeys: 1 })
    expect(composeGoDay([], 2)).toEqual({ percent: null, partial: false })
  })

  it('ciclo: o comum quando todas renovam juntas; senão o da maior cota mensal, com desempate determinístico', () => {
    const a = { name: 'A', startsAt: '2026-11-05T12:15:35.000Z', endsAt: '2026-12-05T12:15:35.000Z', monthLimit: 6e9 }
    expect(goReferenceCycle([a, { ...a, name: 'B' }])).toEqual({ startsAt: a.startsAt, endsAt: a.endsAt, keyName: null })
    const b = { name: 'B', startsAt: '2026-11-10T00:00:00.000Z', endsAt: '2026-12-10T00:00:00.000Z', monthLimit: 12e9 }
    expect(goReferenceCycle([a, b])).toEqual({ startsAt: b.startsAt, endsAt: b.endsAt, keyName: 'B' })
    // Mesma cota: renovação mais próxima.
    expect(goReferenceCycle([{ ...b, monthLimit: 6e9 }, a]).keyName).toBe('A')
    expect(goReferenceCycle([a]).keyName).toBeNull()
  })

  it('gráfico conta os dias com chave faltando sem repetir os dias sem dados', () => {
    const series = new Map<string, GoDayValue>([
      ['2026-11-06', { percent: 2, partial: false, missingKeys: 1 }],
      ['2026-11-07', { percent: null, partial: false }],
      ['2026-11-08', { percent: 1, partial: false }],
    ])
    const forecast = goForecast({ startMs: START, endMs: END, nowMs: NOW, percent: 30 })
    const chart = buildGoChart({ cycle: { startMs: START, endMs: END, current: true }, nowMs: NOW, days: series, monthRatio: 30, forecast, historyFrom: '2026-10-05' })
    expect(chart.missingKeyDays).toBe(1)
    expect(chart.points.find((point) => point.date === '2026-11-06')!.dayPercent).toBe(2)
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
