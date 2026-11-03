/** @vitest-environment happy-dom */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

// O recharts não desenha no happy-dom (sem medidas): o gráfico é simulado e cada <Line> guarda as
// props recebidas, para conferir cor, traço, interpolação, continuidade e marcadores.
const lines: Record<string, unknown>[] = []
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: (props: Record<string, unknown>) => {
    lines.push(props)
    return null
  },
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: (props: Record<string, unknown>) => <div data-testid="y-axis" data-domain={JSON.stringify(props.domain)} />,
  Tooltip: () => null,
  Legend: () => null,
}))
vi.mock('@/components/ui/chart', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/chart')>()),
  ChartContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { MultiLineChart } from '@/components/metrics/MultiLineChart'
import { LineChartTooltip } from '@/components/metrics/LineChartTooltip'
import { lineSeriesItems } from '@/components/metrics/line-chart-model'

const LABELS = ['% de regressão', '% de bloqueio pelo Adversário', '% de one shot', '% de lições do Mentor', '% de conflito de merge', 'Regressão: % reabertas', 'Regressão: % com achado de regressão', 'Regressão: % com correção de prévia', '% de CI com falha', '% de CI corrigido automaticamente', '% interrompidas', '% retomadas', '% com nova tentativa']
const KEYS = ['regression', 'blocked', 'oneShot', 'lesson', 'conflict', 'reopened', 'regressionFinding', 'previewCorrection', 'ciFailed', 'ciFixed', 'interrupted', 'resumed', 'retried']
const SERIES = KEYS.map((key, index) => ({ key, label: LABELS[index]!, defaultSelected: index < 3 }))
const POINTS = [
  { bucket: '2026-10-16', ...Object.fromEntries(KEYS.map((key) => [key, 50])) },
  { bucket: '2026-10-17', ...Object.fromEntries(KEYS.map((key) => [key, null])) },
  { bucket: '2026-10-19', ...Object.fromEntries(KEYS.map((key) => [key, 20])) },
]
const SAMPLES = [
  { bucket: '2026-10-16', base: 2, bySeries: Object.fromEntries(KEYS.map((key) => [key, 2])) },
  { bucket: '2026-10-17', base: 0, bySeries: Object.fromEntries(KEYS.map((key) => [key, 0])) },
  { bucket: '2026-10-19', base: 5, bySeries: { ...Object.fromEntries(KEYS.map((key) => [key, 5])), ciFixed: 1 } },
]

const renderChart = () =>
  render(<MultiLineChart persistKey="desenvolvedor:percentages" series={SERIES} points={POINTS} samples={SAMPLES} sampleLabel="mesas concluídas" minSample={3} format="percent" ariaLabel="Métricas" />)
const lastLines = () => {
  const byKey = new Map<string, Record<string, unknown>>()
  for (const props of lines) byKey.set(String(props.dataKey), props)
  return byKey
}
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement

beforeEach(() => {
  window.localStorage.clear()
  lines.length = 0
})
afterEach(cleanup)

describe('linhas do gráfico de métricas', () => {
  it('regressão do print: bloqueio x interrompidas e lições x retomadas têm cores diferentes', () => {
    const items = lineSeriesItems(SERIES)
    const color = (key: string) => items.find((item) => item.key === key)!.color
    expect(color('blocked')).not.toBe(color('interrupted'))
    expect(color('lesson')).not.toBe(color('resumed'))
  })

  it('só as séries marcadas viram linha; marcar e desmarcar adiciona e remove a linha', () => {
    renderChart()
    expect([...lastLines().keys()].sort()).toEqual(['blocked', 'oneShot', 'regression'])
    lines.length = 0
    fireEvent.click(checkbox('% interrompidas'))
    expect(lastLines().has('interrupted')).toBe(true)
    lines.length = 0
    fireEvent.click(checkbox('% interrompidas'))
    expect(lastLines().has('interrupted')).toBe(false)
  })

  it('critério aprovado (OPE-131, linha suave e contínua): toda linha é curva e liga os pontos nos dias sem dados', () => {
    renderChart()
    for (const props of lastLines().values()) {
      expect(props.type).toBe('monotone')
      expect(props.connectNulls).toBe(true)
    }
  })

  it('a cor e o tracejado da legenda são os mesmos do traço da linha', () => {
    renderChart()
    fireEvent.click(checkbox('% com nova tentativa'))
    const line = lastLines().get('retried')!
    const swatch = checkbox('% com nova tentativa').closest('li')!.querySelector('[data-swatch-color]')!
    expect(swatch.getAttribute('data-swatch-color')).toBe(line.stroke)
    expect(swatch.getAttribute('data-swatch-dash')).toBe(String(line.strokeDasharray ?? ''))
    expect(line.strokeDasharray).toBeTruthy()
  })

  it('ponto com n abaixo do mínimo sai vazado; com n suficiente, cheio; dia vazio sem marcador', () => {
    renderChart()
    const Dot = lastLines().get('regression')!.dot as (props: Record<string, unknown>) => React.ReactElement
    const { container } = render(
      <svg>
        {Dot({ cx: 1, cy: 1, index: 0, value: 50 })}
        {Dot({ cx: 2, cy: 2, index: 1, value: null })}
        {Dot({ cx: 3, cy: 3, index: 2, value: 20 })}
      </svg>,
    )
    expect([...container.querySelectorAll('[data-dot]')].map((node) => node.getAttribute('data-dot'))).toEqual(['hollow', 'filled'])
  })

  it('eixo de % fixo em 0–100 e a tabela leva a coluna n', () => {
    renderChart()
    expect(screen.getByTestId('y-axis').getAttribute('data-domain')).toBe('[0,100]')
    const headers = [...document.querySelectorAll('[role="group"][aria-label="Métricas"] th')].map((th) => th.textContent)
    expect(headers.slice(0, 2)).toEqual(['Data', 'n'])
    const firstRow = document.querySelectorAll('[role="group"][aria-label="Métricas"] tbody tr')[0]!
    expect(firstRow.children[1]!.textContent).toBe('2')
    expect(screen.getByText(/n = mesas concluídas em cada dia/)).toBeTruthy()
  })

  it('gráfico de soma (sem amostra) não mostra n', () => {
    render(<MultiLineChart persistKey="opex:tokens" series={[{ key: 'tokens', label: 'Tokens', defaultSelected: true }]} points={[{ bucket: '2026-11-01', tokens: 10 }]} format="tokens" ariaLabel="Tokens" />)
    const headers = [...document.querySelectorAll('[role="group"][aria-label="Tokens"] th')].map((th) => th.textContent)
    expect(headers).toEqual(['Data', 'Tokens'])
    expect(screen.queryByText(/n = /)).toBeNull()
  })
})

describe('tooltip do gráfico de linhas', () => {
  const items = lineSeriesItems(SERIES).filter((item) => ['regression', 'ciFixed'].includes(item.key))
  const props = { points: POINTS, samples: SAMPLES, items, format: 'percent' as const, sampleLabel: 'mesas concluídas', minSample: 3 }

  it('mostra data, nome, %, n do dia e a nota de amostra pequena', () => {
    render(<LineChartTooltip active label="2026-10-16" {...props} />)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip.textContent).toContain('16/10')
    expect(tooltip.textContent).toContain('n = 2 mesas concluídas')
    expect(tooltip.textContent).toContain('% de regressão')
    expect(tooltip.textContent).toContain('50%')
    expect(tooltip.textContent).toContain('Amostra pequena: pouco representativo')
  })

  it('métrica com base própria mostra o próprio n', () => {
    render(<LineChartTooltip active label="2026-10-19" {...props} />)
    const row = screen.getByRole('tooltip').querySelector('[data-series="ciFixed"]')!
    expect(row.textContent).toContain('(n = 1)')
    expect(screen.getByRole('tooltip').querySelector('[data-series="regression"]')!.textContent).not.toContain('(n =')
  })

  it('dia sem dados: a linha só atravessa o dia ("Sem mesas concluídas (n = 0)")', () => {
    render(<LineChartTooltip active label="2026-10-17" {...props} />)
    expect(screen.getByRole('tooltip').textContent).toContain('Sem mesas concluídas (n = 0)')
  })

  it('dia com mesas, mas sem base na série visível: não diz "Sem mesas" e mostra o n da data', () => {
    const ciOnly = lineSeriesItems(SERIES).filter((item) => item.key === 'ciFixed')
    const points = [{ bucket: '2026-10-20', ...Object.fromEntries(KEYS.map((key) => [key, key === 'ciFixed' ? null : 20])) }]
    const samples = [{ bucket: '2026-10-20', base: 5, bySeries: { ...Object.fromEntries(KEYS.map((key) => [key, 5])), ciFixed: 0 } }]
    render(<LineChartTooltip active label="2026-10-20" {...props} items={ciOnly} points={points} samples={samples} />)
    const text = screen.getByRole('tooltip').textContent ?? ''
    expect(text).not.toContain('Sem mesas concluídas (n = 0)')
    expect(text).toContain('Sem base para as métricas selecionadas nesta data (n da data = 5 mesas concluídas)')
  })

  it('usa a moldura padrão dos tooltips dos gráficos (mesmas classes do ChartTooltipContent)', () => {
    render(<LineChartTooltip active label="2026-10-16" {...props} />)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip.classList.contains('min-w-[8rem]')).toBe(true)
    expect(tooltip.classList.contains('max-w-[280px]')).toBe(true)
  })

  it('semana: "Semana de dd/MM"', () => {
    render(<LineChartTooltip active label="2026-10-19" {...props} bucketMode="week" />)
    expect(screen.getByRole('tooltip').textContent).toContain('Semana de 19/10')
  })
})

describe('esqueleto da Visão geral', () => {
  it('o primeiro cartão é o gráfico de linhas: largura toda e altura com o eixo do n', async () => {
    const { MetricsOverviewSkeleton } = await import('@/components/metrics/MetricsOverviewSkeleton')
    const { CHART_HEIGHT, LINE_CHART_CARD_CHROME, CHART_CARD_CHROME } = await import('@/components/metrics/layout')
    render(<MetricsOverviewSkeleton />)
    const lines = document.querySelector('[data-chart-skeleton="lines"]') as HTMLElement
    expect(lines.classList.contains('lg:col-span-2')).toBe(true)
    expect(lines.style.height).toBe(`${CHART_HEIGHT + LINE_CHART_CARD_CHROME}px`)
    expect((document.querySelector('[data-chart-skeleton="chart"]') as HTMLElement).style.height).toBe(`${CHART_HEIGHT + CHART_CARD_CHROME}px`)
  })
})
