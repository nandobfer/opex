/** @vitest-environment happy-dom */
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { CycleChartDto as GoChartDto } from "@nandobfer/integracoes/modules/integrations/ia/features/subscription-usage/types"

vi.mock('framer-motion', () => framerMotionMock())

// O recharts não desenha no happy-dom (sem medidas): cada peça é simulada e guarda as props recebidas, para
// conferir o desenho do Console (teto de 100% destacado, círculos, verticais, área com hachura e faixa de datas).
const { calls, record, START, END } = vi.hoisted(() => {
  const calls: { type: string; props: Record<string, unknown> }[] = []
  const record = (type: string) => (props: Record<string, unknown>) => {
    calls.push({ type, props })
    return null
  }
  return { calls, record, START: Date.parse('2026-11-05T12:15:35.000Z'), END: Date.parse('2026-12-05T12:15:35.000Z') }
})
vi.mock('recharts', () => ({
  ComposedChart: ({ children }: { children: React.ReactNode }) => (
    <svg data-testid="chart">{children}</svg>
  ),
  Area: record('Area'),
  Line: record('Line'),
  CartesianGrid: record('CartesianGrid'),
  XAxis: record('XAxis'),
  YAxis: record('YAxis'),
  ReferenceLine: record('ReferenceLine'),
  ReferenceDot: record('ReferenceDot'),
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  // Área do gráfico de 0 a 1000 px na horizontal, escala linear no tempo do ciclo.
  usePlotArea: () => ({ x: 0, y: 0, width: 1000, height: 200 }),
  useXAxisScale: () => (t: number) => ((t - START) / (END - START)) * 1000,
}))
vi.mock('@/components/ui/chart', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/chart')>()),
  ChartContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { CycleUsageChart } from "@nandobfer/integracoes/modules/integrations/ia/features/subscription-usage/components/CycleUsageChart"
import { CycleChartTooltip } from "@nandobfer/integracoes/modules/integrations/ia/features/subscription-usage/components/CycleChartTooltip"
import * as chartStyle from '@nandobfer/integracoes/modules/integrations/ia/features/subscription-usage/components/chart-style'

const NOW = Date.parse('2026-11-16T19:57:00.000Z')
const CROSS = Date.parse('2026-12-01T09:34:56.000Z')

const chart = (overrides: Partial<GoChartDto> = {}): GoChartDto => ({
  cycle: { startsAt: new Date(START).toISOString(), endsAt: new Date(END).toISOString(), current: true },
  points: [
    { t: START, date: '2026-11-05', dayPercent: null, usage: 0, forecast: null, dayForecast: null },
    { t: NOW, date: '2026-11-16', dayPercent: 3.2, usage: 44.3, forecast: 44.3, dayForecast: null },
    { t: Date.parse('2026-11-25T00:00:00.000Z'), date: '2026-11-24', dayPercent: null, usage: null, forecast: 75.27, dayForecast: 3.92 },
    { t: END, date: '2026-12-05', dayPercent: null, usage: null, forecast: 115.9, dayForecast: 2.01 },
  ],
  today: { t: NOW, percent: 44.3 },
  crossing: { t: CROSS, value: 100, label: '1 dez' },
  forecastEnd: { t: END, percent: 115.9 },
  yMax: 120,
  missingDays: 0,
  partialDays: 0,
  incompleteDays: 0,
  historyFrom: '2026-10-06',
  ...overrides,
})

const of = (type: string) => calls.filter((call) => call.type === type).map((call) => call.props)

beforeEach(() => {
  calls.length = 0
})
afterEach(cleanup)

describe('CycleUsageChart (desenho do Console)', () => {
  it('eixo de tempo do ciclo, eixo Y até o maior valor com folga, teto de 100% pontilhado e destacado, verticais em hoje e no cruzamento', () => {
    render(<CycleUsageChart subject="OpenCode Go" chart={chart()} dailyAverage={3.9} />)
    expect(of('XAxis')[0]).toMatchObject({ dataKey: 't', type: 'number', domain: [START, END] })
    // OPE-171: previsão de 115,9% → eixo até 120%, marcas de 50 em 50 mais o topo (sem o vão até 150%).
    expect(of('YAxis')[0]).toMatchObject({ domain: [0, 120], ticks: [0, 50, 100, 120] })
    const lines = of('ReferenceLine')
    const ceiling = lines.find((props) => props.y === 100)!
    expect(ceiling.strokeDasharray).toBeTruthy()
    expect(Number(ceiling.strokeWidth)).toBeGreaterThan(1)
    expect(lines.filter((props) => props.x !== undefined).map((props) => props.x)).toEqual([NOW, CROSS])
  })

  it('eixo Y que cai num múltiplo de 50 não repete o topo', () => {
    render(<CycleUsageChart subject="OpenCode Go" chart={chart({ yMax: 150 })} dailyAverage={3.9} />)
    expect(of('YAxis')[0]).toMatchObject({ domain: [0, 150], ticks: [0, 50, 100, 150] })
  })

  it('uso em área verde com gradiente, previsão em reta amarela com hachura e círculos vazados com o % previsto', () => {
    render(<CycleUsageChart subject="OpenCode Go" chart={chart()} dailyAverage={3.9} />)
    const areas = of('Area')
    expect(areas.find((props) => props.dataKey === 'usage')!.fill).toMatch(/^url\(#usage-area-/)
    expect(areas.find((props) => props.dataKey === 'forecast')!.fill).toMatch(/^url\(#usage-hatch-/)
    expect(of('Line')[0]).toMatchObject({ dataKey: 'forecast', type: 'linear' })
    const dots = of('ReferenceDot')
    expect(dots.map((props) => [props.x, props.y])).toEqual([[NOW, 44.3], [CROSS, 100], [END, 115.9]])
    expect(dots.every((props) => props.fill === 'var(--color-card)')).toBe(true)
    expect((dots[2]!.label as { value: string }).value).toBe('116%')
  })

  it('faixa de datas em caixa alta com o cruzamento destacado; rodapé com a média em negrito e a legenda', () => {
    const { container } = render(<CycleUsageChart subject="OpenCode Go" chart={chart()} dailyAverage={3.9} />)
    expect([...container.querySelectorAll('[data-usage-tick]')].map((node) => node.textContent)).toEqual(['5 NOV', '15 NOV', '25 NOV', '1 DEZ', '5 DEZ'])
    expect(container.querySelector('[data-usage-tick="crossing"]')!.textContent).toBe('1 DEZ')
    expect(container.querySelector('[data-usage-tick="crossing"]')!.getAttribute('font-weight')).toBe('700')
    expect(container.querySelector('[data-usage-average] strong')!.textContent).toBe('3,9%')
    expect([...container.querySelectorAll('[data-usage-legend]')].map((node) => node.textContent)).toEqual(['Uso', 'Previsão', 'Teto mensal'])
  })

  it('teto de 100% em cor pronta do tema, mais forte que a grade', () => {
    render(<CycleUsageChart subject="OpenCode Go" chart={chart()} dailyAverage={3.9} />)
    const ceiling = of('ReferenceLine').find((props) => props.y === 100)!
    const grid = of('CartesianGrid')[0]!
    expect(ceiling.stroke).toBe('var(--color-foreground)')
    expect(Number(ceiling.strokeOpacity)).toBeGreaterThan(Number(grid.strokeOpacity))
    expect(Number(ceiling.strokeWidth)).toBeGreaterThan(Number(grid.strokeWidth ?? 1))
  })

  it('regressão (texto preto e teto invisível): toda cor do SVG é pronta, nunca variável base do tema', () => {
    // `--foreground`, `--muted-foreground`, `--border` e `--card` guardam só números de HSL: num fill/stroke viram cor inválida.
    const base = /var\(--(foreground|muted-foreground|border|card)\)/
    const ready = (value: unknown) => typeof value !== 'string' || value === 'none' || value.startsWith('url(') || /^(var\(--(color|chart)-[a-z0-9-]+\)|#[0-9a-f]{3,8})$/i.test(value)
    for (const [name, value] of Object.entries(chartStyle)) if (name.endsWith('_COLOR')) expect(ready(value), value).toBe(true)

    const { container } = render(<CycleUsageChart subject="OpenCode Go" chart={chart()} dailyAverage={3.9} />)
    for (const { type, props } of calls) {
      for (const key of ['stroke', 'fill']) expect(ready(props[key]), `${type}.${key} = ${String(props[key])}`).toBe(true)
      const tick = props.tick as { fill?: unknown } | undefined
      if (tick) expect(ready(tick.fill), `${type}.tick.fill`).toBe(true)
    }
    for (const node of container.querySelectorAll('[fill], [stroke]')) {
      for (const attr of ['fill', 'stroke']) {
        const value = node.getAttribute(attr)
        if (value) expect(ready(value), `<${node.tagName}> ${attr}=${value}`).toBe(true)
      }
    }
    expect(container.innerHTML).not.toMatch(base)
    const ceilingLegend = container.querySelector('[data-usage-legend="ceiling"] span span') as HTMLElement
    expect(ceilingLegend.getAttribute('style')).toContain('var(--color-foreground)')
  })

  it('dica no trecho da previsão: data do dia, previsão do dia e acumulado previsto', () => {
    const { points } = chart()
    const { container } = render(<CycleChartTooltip active label={Date.parse('2026-11-25T00:00:00.000Z')} points={points} />)
    expect(container.textContent).toContain('24/11/2026')
    expect(container.querySelector('[data-usage-tooltip-row="dayForecast"]')!.textContent).toBe('Previsão do dia3,92%')
    expect(container.querySelector('[data-usage-tooltip-row="forecast"]')!.textContent).toBe('Acumulado previsto75,3%')
    expect(container.querySelector('[data-usage-tooltip-row="day"]')).toBeNull()
    expect(container.querySelector('[data-usage-tooltip-row="usage"]')).toBeNull()
  })

  it('dica no trecho verde continua com uso do dia e acumulado, sem previsão', () => {
    const { points } = chart()
    const { container } = render(<CycleChartTooltip active label={NOW} points={points} />)
    expect(container.querySelector('[data-usage-tooltip-row="day"]')!.textContent).toBe('Uso do dia3,20%')
    expect(container.querySelector('[data-usage-tooltip-row="usage"]')!.textContent).toBe('Acumulado44,3%')
    expect(container.querySelector('[data-usage-tooltip-row="dayForecast"]')).toBeNull()
    expect(container.querySelector('[data-usage-tooltip-row="forecast"]')).toBeNull()
  })

  it('sem previsão (limite atingido ou ciclo passado) não desenha cruzamento nem fim', () => {
    const { container } = render(<CycleUsageChart subject="OpenCode Go" chart={chart({ crossing: null, forecastEnd: null, today: null, cycle: { startsAt: new Date(START).toISOString(), endsAt: new Date(END).toISOString(), current: false } })} dailyAverage={null} />)
    expect(of('ReferenceDot')).toHaveLength(0)
    expect(container.querySelector('[data-usage-tick="crossing"]')).toBeNull()
    expect(container.querySelector('[data-usage-cycle="past"]')!.textContent).toBe('Ciclo de 5 nov a 5 dez')
    expect(container.querySelector('[data-usage-average]')).toBeNull()
  })
})
