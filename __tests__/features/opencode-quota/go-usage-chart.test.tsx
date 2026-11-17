/** @vitest-environment happy-dom */
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { GoChartDto } from '@/features/opencode-quota/go-types'

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

import { GoUsageChart } from '@/features/opencode-quota/components/go/GoUsageChart'

const NOW = Date.parse('2026-11-16T19:57:00.000Z')
const CROSS = Date.parse('2026-12-01T09:34:56.000Z')

const chart = (overrides: Partial<GoChartDto> = {}): GoChartDto => ({
  cycle: { startsAt: new Date(START).toISOString(), endsAt: new Date(END).toISOString(), current: true },
  points: [
    { t: START, date: '2026-11-05', dayPercent: null, usage: 0, forecast: null },
    { t: NOW, date: '2026-11-16', dayPercent: 3.2, usage: 44.3, forecast: 44.3 },
    { t: END, date: '2026-12-05', dayPercent: null, usage: null, forecast: 115.9 },
  ],
  today: { t: NOW, percent: 44.3 },
  crossing: { t: CROSS, value: 100, label: '1 dez' },
  forecastEnd: { t: END, percent: 115.9 },
  yMax: 150,
  missingDays: 0,
  partialDays: 0,
  historyFrom: '2026-10-06',
  ...overrides,
})

const of = (type: string) => calls.filter((call) => call.type === type).map((call) => call.props)

beforeEach(() => {
  calls.length = 0
})
afterEach(cleanup)

describe('GoUsageChart (desenho do Console)', () => {
  it('eixo de tempo do ciclo, grade 0–150%, teto de 100% pontilhado e destacado, verticais em hoje e no cruzamento', () => {
    render(<GoUsageChart chart={chart()} dailyAverage={3.9} />)
    expect(of('XAxis')[0]).toMatchObject({ dataKey: 't', type: 'number', domain: [START, END] })
    expect(of('YAxis')[0]).toMatchObject({ domain: [0, 150], ticks: [0, 50, 100, 150] })
    const lines = of('ReferenceLine')
    const ceiling = lines.find((props) => props.y === 100)!
    expect(ceiling.strokeDasharray).toBeTruthy()
    expect(Number(ceiling.strokeWidth)).toBeGreaterThan(1)
    expect(lines.filter((props) => props.x !== undefined).map((props) => props.x)).toEqual([NOW, CROSS])
  })

  it('uso em área verde com gradiente, previsão em reta amarela com hachura e círculos vazados com o % previsto', () => {
    render(<GoUsageChart chart={chart()} dailyAverage={3.9} />)
    const areas = of('Area')
    expect(areas.find((props) => props.dataKey === 'usage')!.fill).toMatch(/^url\(#go-usage-/)
    expect(areas.find((props) => props.dataKey === 'forecast')!.fill).toMatch(/^url\(#go-hatch-/)
    expect(of('Line')[0]).toMatchObject({ dataKey: 'forecast', type: 'linear' })
    const dots = of('ReferenceDot')
    expect(dots.map((props) => [props.x, props.y])).toEqual([[NOW, 44.3], [CROSS, 100], [END, 115.9]])
    expect(dots.every((props) => props.fill === 'var(--card)')).toBe(true)
    expect((dots[2]!.label as { value: string }).value).toBe('116%')
  })

  it('faixa de datas em caixa alta com o cruzamento destacado; rodapé com a média em negrito e a legenda', () => {
    const { container } = render(<GoUsageChart chart={chart()} dailyAverage={3.9} />)
    expect([...container.querySelectorAll('[data-go-tick]')].map((node) => node.textContent)).toEqual(['5 NOV', '15 NOV', '25 NOV', '1 DEZ', '5 DEZ'])
    expect(container.querySelector('[data-go-tick="crossing"]')!.textContent).toBe('1 DEZ')
    expect(container.querySelector('[data-go-tick="crossing"]')!.getAttribute('font-weight')).toBe('700')
    expect(container.querySelector('[data-go-average] strong')!.textContent).toBe('3,9%')
    expect([...container.querySelectorAll('[data-go-legend]')].map((node) => node.textContent)).toEqual(['Uso', 'Previsão', 'Teto mensal'])
  })

  it('sem previsão (limite atingido ou ciclo passado) não desenha cruzamento nem fim', () => {
    const { container } = render(<GoUsageChart chart={chart({ crossing: null, forecastEnd: null, today: null, cycle: { startsAt: new Date(START).toISOString(), endsAt: new Date(END).toISOString(), current: false } })} dailyAverage={null} />)
    expect(of('ReferenceDot')).toHaveLength(0)
    expect(container.querySelector('[data-go-tick="crossing"]')).toBeNull()
    expect(container.querySelector('[data-go-cycle="past"]')!.textContent).toBe('Ciclo de 5 nov a 5 dez')
    expect(container.querySelector('[data-go-average]')).toBeNull()
  })
})
