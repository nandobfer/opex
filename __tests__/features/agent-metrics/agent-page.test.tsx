/** @vitest-environment happy-dom */
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { AgentMetricsDto } from '@/features/agent-metrics/types'

const mocks = vi.hoisted(() => ({ metrics: vi.fn(), history: vi.fn(), refetch: vi.fn() }))
vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/features/agent-metrics/hooks/useAgentMetrics', () => ({
  useAgentMetrics: mocks.metrics,
  useAgentHistoryPages: mocks.history,
  useAgentMetricsRealtime: vi.fn(),
}))
vi.mock('@/features/agentic/components/DeveloperMemoriesSection', () => ({ DeveloperMemoriesSection: () => <div>memórias do desenvolvedor</div> }))
vi.mock('@/features/architect-agent/components/settings/MemoriesSection', () => ({ MemoriesSection: () => <div>memórias do arquiteto</div> }))
vi.mock('@/features/opex-agent/components/settings/OpexMemoriesSection', () => ({ OpexMemoriesSection: () => <div>memórias do opex</div> }))

import { DesenvolvedorAgentPage, OpexAgentMetricsPage, OrcamentistaAgentPage } from '@/features/agent-metrics/components/agent-pages'

const data = (overrides: Partial<AgentMetricsDto> = {}): AgentMetricsDto => ({
  agent: 'desenvolvedor',
  range: { from: '2026-10-05T03:00:00.000Z', to: '2026-11-04T02:59:59.999Z' },
  bucketMode: 'day',
  lastUsedAt: null,
  usageUnit: 'turnos',
  usage: [{ bucket: '2026-11-02', runs: 0, failures: 0 }],
  kpis: [
    { id: 'regression', label: '% de regressão', hint: 'Reaberta, achado de regressão ou correção de prévia', value: 25, format: 'percent', since: null },
    { id: 'interrupted', label: '% interrompidas', hint: 'Interrupção pedida por você', value: null, format: 'percent', since: '2026-11-03T12:00:00.000Z' },
  ],
  lines: [{ id: 'percentages', title: 'Métricas ao longo do tempo', description: 'x', format: 'percent', series: [{ key: 'regression', label: '% de regressão', defaultSelected: true }], points: [{ bucket: '2026-11-02', regression: 25 }] }],
  bars: [],
  baseCount: 4,
  baseLabel: '4 mesas concluídas',
  emptyReason: 'Nenhuma mesa foi concluída no período com estes filtros.',
  notices: [{ label: 'Interrompidas, retomadas, CI corrigido e tempo por etapa', since: '2026-11-03T12:00:00.000Z' }],
  availability: { available: true, reason: null },
  clients: [{ id: 'c1', name: 'Cliente 1' }],
  projects: [{ id: 'p1', name: 'App', repo: 'org/app' }],
  ...overrides,
})

const ok = (value: AgentMetricsDto) => ({ data: value, isLoading: false, isError: false, error: null, refetch: mocks.refetch })

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/agente-desenvolvedor')
  mocks.metrics.mockReturnValue(ok(data()))
  mocks.history.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn(), hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false, fetchNextPage: vi.fn() })
})
afterEach(cleanup)

describe('página de um agente (OPE-122)', () => {
  it('cabeçalho "Agente X", Configurar na aba certa e Visão geral como primeira aba e padrão', () => {
    render(<DesenvolvedorAgentPage />)
    expect(screen.getByRole('heading', { name: 'Agente Desenvolvedor' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Configurar/ }).getAttribute('href')).toBe('/integracoes/ia?aba=desenvolvimento-agentico')
    const tabs = within(screen.getByRole('radiogroup', { name: 'Abas do Agente Desenvolvedor' })).getAllByRole('radio').map((tab) => tab.textContent)
    expect(tabs).toEqual(['Visão geral', 'Histórico', 'Memórias'])
    expect(screen.getByRole('radio', { name: 'Visão geral' }).getAttribute('aria-checked')).toBe('true')
  })

  it('KPIs: Último uso "Nunca usado", "—" sem base e "Dados desde" da métrica não retroativa', () => {
    render(<DesenvolvedorAgentPage />)
    expect(screen.getByText('Nunca usado')).toBeTruthy()
    expect(screen.getAllByText('25%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Dados desde 03\/11\/2026/).length).toBeGreaterThan(0)
    expect(screen.getByText('Uso por data')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: '% de regressão' })).toBeTruthy()
  })

  it('sem base no período: estado vazio explica o motivo (Último uso e Uso por data continuam)', () => {
    mocks.metrics.mockReturnValue(ok(data({ baseCount: 0 })))
    render(<DesenvolvedorAgentPage />)
    expect(screen.getByText('Sem dados no período')).toBeTruthy()
    expect(screen.getByText('Nenhuma mesa foi concluída no período com estes filtros.')).toBeTruthy()
    expect(screen.queryByText('% de regressão')).toBeNull()
    expect(screen.getByText('Último uso')).toBeTruthy()
  })

  it('erro mostra Tentar novamente; agente desligado mostra o aviso', () => {
    mocks.metrics.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('x'), refetch: mocks.refetch })
    const { unmount } = render(<DesenvolvedorAgentPage />)
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.refetch).toHaveBeenCalled()
    unmount()
    mocks.metrics.mockReturnValue(ok(data({ availability: { available: false, reason: 'Ative o desenvolvimento agêntico' } })))
    render(<DesenvolvedorAgentPage />)
    expect(screen.getByText('Ative o desenvolvimento agêntico')).toBeTruthy()
  })

  it('filtros na URL; o que não se aplica fica oculto (Opex não tem repositório) e a margem é do Orçamentista', () => {
    const { unmount } = render(<OpexAgentMetricsPage />)
    expect(screen.getByText('Clientes')).toBeTruthy()
    expect(screen.queryByText('Repositórios')).toBeNull()
    expect(screen.queryByText('Margem (±%)')).toBeNull()
    unmount()
    window.history.replaceState(null, '', '/agente-orcamentista?margem=30')
    render(<OrcamentistaAgentPage />)
    expect(screen.getByText('Repositórios')).toBeTruthy()
    expect((screen.getByLabelText('Margem da estimativa em porcentagem') as HTMLInputElement).value).toBe('30')
    fireEvent.click(screen.getByRole('radio', { name: '90 dias' }))
    expect(new URLSearchParams(window.location.search).get('periodo')).toBe('90d')
  })

  it('Histórico: aba na URL e cada linha leva ao item de origem', () => {
    mocks.history.mockReturnValue({
      data: { pages: [{ items: [{ id: 'w1', at: '2026-11-02T12:00:00.000Z', title: 'OPE-1 · Tela', subtitle: 'Concluída', status: { label: 'Concluída', tone: 'success' }, href: '/desenvolvimento/t1', unavailable: null, chips: [] }], page: 1, limit: 20, total: 1, totalPages: 1 }] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage: vi.fn(),
    })
    render(<DesenvolvedorAgentPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'Histórico' }))
    expect(new URLSearchParams(window.location.search).get('aba')).toBe('historico')
    const list = screen.getByRole('list', { name: 'Histórico do agente' })
    expect(within(list).getByRole('link').getAttribute('href')).toBe('/desenvolvimento/t1')
  })
})
