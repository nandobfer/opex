/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { RoutineAgentMetricsDto, RoutineCostDto, RoutineRunDto } from '@/features/routine-agents/types'

/**
 * OPE-203: custos nas telas dos rotineiros — KPIs de tabela, efetivo, economia e médias com o R$, "Parcial" com o
 * modelo sem preço, estimados marcados, gráfico de custo por dia, divisão por provedor/modelo/plano e as colunas da
 * linha da execução. O skeleton tem a mesma quantidade de KPIs e gráficos.
 */

const mocks = vi.hoisted(() => ({ metrics: null as unknown, loading: false }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/routine-agents/hooks/useRoutineRuns', () => ({ useRoutineMetrics: () => ({ data: mocks.metrics, isLoading: mocks.loading, isError: false, refetch: vi.fn() }) }))
vi.mock('@/components/metrics/UsageByDateChart', () => ({ UsageByDateChart: () => <div data-testid="usage-chart" /> }))
vi.mock('@/components/metrics/MultiLineChart', () => ({
  MultiLineChart: ({ ariaLabel, points, series }: { ariaLabel: string; points: Record<string, unknown>[]; series: { key: string }[] }) => <div data-testid={`lines-${ariaLabel}`} data-series={series.map((item) => item.key).join(',')} data-points={JSON.stringify(points)} />,
}))
vi.mock('@/components/metrics/charts/RankedBarsCard', () => ({ RankedBarsCard: ({ data, ariaLabel }: { data: { label: string }[]; ariaLabel: string }) => <div data-testid="ranked" aria-label={ariaLabel}>{data.map((row) => row.label).join('|')}</div> }))

import { RoutineOverviewTab } from '@/features/routine-agents/components/page/RoutineOverviewTab'
import { RoutineRunRow } from '@/features/routine-agents/components/runs/RoutineRunRow'
import { ROUTINE_OVERVIEW_CHART_COUNT, ROUTINE_OVERVIEW_KPI_COUNT } from '@/features/routine-agents/components/page/routine-agents-layout'

const totals = (extra: Partial<RoutineCostDto> = {}): RoutineCostDto => ({ listUsd: 4, listBrl: 20, effectiveUsd: 1, effectiveBrl: 5, savingsUsd: 3, savingsBrl: 15, partial: false, brlPartial: false, missingPrices: [], estimated: false, notices: [], ...extra })
const pair = { listUsd: 2, effectiveUsd: 0.5, listBrl: 10, effectiveBrl: 2.5 }

const metrics = (cost: RoutineCostDto = totals()): RoutineAgentMetricsDto => ({
  kpis: { runs: 2, completed: 2, errors: 0, avgDurationMs: 1000, tokens: 400, costUsd: null, costPartial: false },
  days: [{ day: '2026-11-04', runs: 2, completed: 2, errors: 0, tokens: 400, costUsd: null, cost: { listUsd: 4, effectiveUsd: 1, listBrl: 20, effectiveBrl: 5 } }],
  cost: { totals: cost, perRun: pair, perCalendarDay: pair, perActiveDay: pair, runsWithCost: 2, calendarDays: 1, activeDays: 1 },
  breakdown: {
    providers: [{ key: 'deepseek', label: 'DeepSeek', listUsd: 4, effectiveUsd: 1, listBrl: 20, effectiveBrl: 5, partial: false }],
    models: [{ key: 'deepseek/deepseek-flash', label: 'deepseek-flash (DeepSeek)', listUsd: 4, effectiveUsd: 1, listBrl: 20, effectiveBrl: 5, partial: false }],
    plans: [{ key: 'deepseek:x', label: 'DeepSeek · Pessoal · Créditos', listUsd: 4, effectiveUsd: 1, listBrl: 20, effectiveBrl: 5, partial: false }],
  },
  lastRunAt: null,
})

beforeEach(() => {
  mocks.loading = false
  mocks.metrics = metrics()
})
afterEach(cleanup)

describe('Visão geral: custos (OPE-203)', () => {
  it('KPIs de tabela, efetivo, economia e médias, com o R$; gráfico de custo por dia com as duas séries', () => {
    render(<RoutineOverviewTab agentId="a1" params={{}} />)
    for (const label of ['Custo de tabela', 'Custo efetivo', 'Economia', 'Média por execução', 'Média por dia', 'Média por dia ativo']) expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByText('R$ 20,00')).toBeTruthy()
    expect(screen.getByText(/2 dia\(s\)|1 dia\(s\) corrido/)).toBeTruthy()
    const chart = screen.getByTestId('lines-Custo por dia')
    expect(chart.getAttribute('data-series')).toBe('list,effective')
    expect(JSON.parse(chart.getAttribute('data-points')!)).toEqual([{ bucket: '2026-11-04', list: 4, effective: 1 }])
  })

  it('divisão por provedor, modelo e chave/plano', () => {
    render(<RoutineOverviewTab agentId="a1" params={{}} />)
    expect(screen.getByTestId('ranked').textContent).toBe('DeepSeek')
    fireEvent.click(screen.getByRole('radio', { name: 'Modelo' }))
    expect(screen.getByTestId('ranked').textContent).toBe('deepseek-flash (DeepSeek)')
    fireEvent.click(screen.getByRole('radio', { name: 'Chave/plano' }))
    expect(screen.getByTestId('ranked').textContent).toBe('DeepSeek · Pessoal · Créditos')
  })

  it('total Parcial diz qual modelo está sem preço e marca os estimados; R$ sem cotação aparece indisponível', () => {
    mocks.metrics = metrics(totals({ partial: true, missingPrices: ['anthropic/claude-novo'], estimated: true, listBrl: null }))
    render(<RoutineOverviewTab agentId="a1" params={{}} />)
    expect(screen.getByText('Sem preço (total parcial): anthropic/claude-novo.')).toBeTruthy()
    expect(screen.getByText(/custo estimado pelos tokens guardados/)).toBeTruthy()
    expect(screen.getAllByText(/Parcial · inclui estimados/).length).toBeGreaterThan(0)
    expect(screen.getByText('R$ indisponível (sem cotação PTAX)')).toBeTruthy()
  })

  it('o skeleton tem a quantidade de KPIs e gráficos da tela', () => {
    mocks.loading = true
    mocks.metrics = null
    const { container } = render(<RoutineOverviewTab agentId="a1" params={{}} />)
    expect(container.querySelectorAll('[data-chart-skeleton]')).toHaveLength(ROUTINE_OVERVIEW_CHART_COUNT)
    expect(container.querySelectorAll('[aria-label="Carregando a visão geral"] > div:first-child > *')).toHaveLength(ROUTINE_OVERVIEW_KPI_COUNT)
    expect(ROUTINE_OVERVIEW_KPI_COUNT).toBe(11)
  })
})

describe('linha da execução (OPE-203)', () => {
  const run = (extra: Partial<RoutineRunDto> = {}): RoutineRunDto => ({
    id: 'r1', agentId: 'a1', agentName: 'A', seq: 3, status: 'completed', origin: 'manual', request: 'x', hasPayload: false, engine: 'opex', model: 'deepseek-flash',
    queuedAt: '2026-11-04T15:00:00.000Z', startedAt: null, finishedAt: null, activeMs: 1000, waitingMs: 0, tokens: 10, costUsd: null, costPartial: false,
    cost: totals(), hibernation: null, pendingAction: null, report: null, error: null, warnings: [], delayMs: null, ...extra,
  })

  it('mostra o custo de tabela e o efetivo, com o R$ na dica', () => {
    const { container } = render(<RoutineRunRow run={run()} />)
    const list = container.querySelector('[data-cost="list"]')!
    const effective = container.querySelector('[data-cost="effective"]')!
    expect(list.textContent).toContain('4,00')
    expect(effective.textContent).toContain('1,00')
    expect(list.getAttribute('title')).toMatch(/R\$\s20,00/)
  })

  it('OPE-208: a linha inteira é o link para a página da execução (a gaveta saiu)', () => {
    render(<RoutineRunRow run={run()} />)
    const link = screen.getByRole('link', { name: 'Abrir a execução #3' })
    expect(link.getAttribute('href')).toBe('/agentes-rotineiros/a1/execucoes/r1')
  })

  it('motor OpenCode: "—" com a dica de fora do escopo; parcial marcado', () => {
    const { container, unmount } = render(<RoutineRunRow run={run({ engine: 'opencode', cost: null })} />)
    expect(container.querySelector('[data-cost="list"]')!.getAttribute('title')).toContain('fora desta versão')
    unmount()
    const partial = render(<RoutineRunRow run={run({ cost: totals({ partial: true, effectiveUsd: null, effectiveBrl: null }) })} />)
    expect(partial.container.querySelector('[data-cost="effective"]')!.textContent).toBe('—*')
  })
})
