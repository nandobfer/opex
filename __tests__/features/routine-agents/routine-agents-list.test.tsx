/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Telas dos agentes rotineiros (critério aprovado OPE-130, D18–D21): lista `/agentes-rotineiros` com uma
 * linha por agente (KPIs + gráfico) e os filtros padrão; cabeçalho com os botões na linha do título; o
 * "Configurar" da página do agente abre o editor ali mesmo.
 */

const mocks = vi.hoisted(() => ({
  agents: [] as unknown[],
  agentsLoading: false,
  metrics: {} as Record<string, unknown>,
  metricsParams: [] as Record<string, string>[],
  push: vi.fn(),
}))

vi.mock('@/hooks/useInstanceInfo', () => ({ useInstanceInfo: () => ({ data: undefined }) }))
vi.mock('@/features/routine-agents/components/chat/RoutineChatColumn', () => ({
  useRoutineChatCollapsed: () => ({ collapsed: false, setCollapsed: () => {} }),
  RoutineChatColumn: ({ agent }: { agent: { id: string; title: string } }) => <aside data-testid="routine-chat" data-agent-id={agent.id} data-agent-title={agent.title} />,
}))
vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search), usePathname: () => window.location.pathname }))
vi.mock('@/components/metrics/UsageByDateChart', () => ({ UsageByDateChart: ({ points }: { points: { runs: number }[] }) => <div data-testid="usage-chart">{points.reduce((sum, point) => sum + point.runs, 0)}</div> }))
vi.mock('@/features/routine-agents/hooks/useRoutineRealtime', () => ({ useRoutineRealtime: () => {} }))
vi.mock('@/features/routine-agents/hooks/useRoutineAgents', () => ({
  useRoutineAgents: () => ({ data: mocks.agentsLoading ? undefined : mocks.agents, isLoading: mocks.agentsLoading, isError: false, refetch: vi.fn() }),
  useRoutineAgent: (id: string | null) => ({ data: id ? mocks.agents.find((agent) => (agent as { id: string }).id === id) : undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/features/routine-agents/hooks/useRoutineRuns', () => ({
  useRoutineAgentsMetrics: (params: Record<string, string>) => {
    mocks.metricsParams.push(params)
    return { data: mocks.metrics, isLoading: false, isError: false, refetch: vi.fn() }
  },
  useTriggerRoutineRun: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/routine-agents/components/editor/RoutineAgentEditor', () => ({
  RoutineAgentEditor: ({ open, agentId, onClose }: { open: boolean; agentId: string; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Editor do agente">
        {agentId}
        <button type="button" onClick={onClose}>
          Fechar editor
        </button>
      </div>
    ) : null,
}))
vi.mock('@/features/routine-agents/components/runs/RoutineRunDetailSheet', () => ({ RoutineRunDetailSheet: () => null }))
vi.mock('@/features/routine-agents/components/page/secrets/RoutineSecretsTab', () => ({ RoutineSecretsTab: () => <div>segredos</div> }))
vi.mock('@/features/routine-agents/components/page/RoutineOverviewTab', () => ({ RoutineOverviewTab: () => <div>visão geral</div> }))

import { RoutineAgentsPage } from '@/features/routine-agents/components/page/RoutineAgentsPage'
import { RoutineAgentPage } from '@/features/routine-agents/components/page/RoutineAgentPage'
import { AgentPageHeader } from '@/components/list/AgentPageHeader'
import { filterRoutineAgents, routineListStatusOf } from '@/features/routine-agents/list-filters'
import { Bot } from 'lucide-react'
import type { RoutineAgentDto, RoutineAgentMetricsDto } from '@/features/routine-agents/types'
import { EMPTY_ROUTINE_LIMITS } from '@/features/routine-agents/schemas'

const agent = (id: string, extra: Partial<RoutineAgentDto> = {}): RoutineAgentDto => ({
  id,
  name: id,
  title: `Agente ${id}`,
  generated: { name: false, objective: false },
  slug: id.toLowerCase(),
  objective: `Objetivo do ${id}`,
  instructions: '',
  engine: 'opex',
  opex: { provider: 'anthropic', model: 'claude', variant: null, enabledTools: [], enabledMcpServers: [] },
  opencode: { model: 'a/b', variant: null, agent: null, enabledMcps: [] },
  confirmIrreversible: false,
  limits: EMPTY_ROUTINE_LIMITS,
  triggers: [],
  schedule: [],
  status: 'active',
  provisioning: { status: 'ok', error: null, at: null, channels: [], extras: [], blocked: [], warnings: [], steps: { agent: true, token: true, channels: true, extras: true, workdir: true } },
  webhookEnabled: false,
  workdir: null,
  engramindAgent: `opex/rotineiro-${id}`,
  channel: `agentes/rotineiros/${id}`,
  lastRun: null,
  nextFireAt: null,
  activeRuns: 0,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...extra,
})

const metric = (runs: number, errors = 0): RoutineAgentMetricsDto => ({
  kpis: { runs, completed: runs - errors, errors, avgDurationMs: null, tokens: runs * 1000, costUsd: null, costPartial: false },
  days: [{ day: '2026-11-04', runs, completed: runs - errors, errors, tokens: runs * 1000, costUsd: null }],
  lastRunAt: null,
})

beforeEach(() => {
  window.history.replaceState(null, '', '/agentes-rotineiros')
  mocks.agentsLoading = false
  mocks.metricsParams = []
  mocks.agents = [agent('Indexador'), agent('Vagas', { status: 'paused', engine: 'opencode' }), agent('Novo', { provisioning: { status: 'error', error: 'falhou', at: null, channels: [], extras: [], blocked: [], warnings: [], steps: { agent: false, token: false, channels: false, extras: false, workdir: false } } })]
  mocks.metrics = { Indexador: metric(7, 2), Vagas: metric(0) }
})
afterEach(() => cleanup())

describe('critério aprovado (OPE-130, D18): lista /agentes-rotineiros com uma linha por agente', () => {
  it('uma linha por agente com nome (link da página), KPIs do período e o gráfico de execuções', () => {
    render(<RoutineAgentsPage />)
    const row = screen.getByTestId('routine-agent-row-Indexador')
    expect(row.querySelector('a')!.getAttribute('href')).toBe('/agentes-rotineiros/Indexador')
    expect(row.textContent).toContain('Execuções')
    expect(row.textContent).toContain('Com erro')
    expect(screen.getAllByTestId('usage-chart')).toHaveLength(1)
    expect(screen.getByTestId('routine-agent-row-Vagas').textContent).toContain('Sem execuções no período.')
    expect(screen.getAllByTestId(/routine-agent-row-/)).toHaveLength(3)
    expect(mocks.metricsParams.at(-1)).toEqual({ periodo: '30d' })
  })

  it('o skeleton tem a grade das linhas enquanto carrega', () => {
    mocks.agentsLoading = true
    render(<RoutineAgentsPage />)
    expect(screen.getByTestId('routine-agents-skeleton')).toBeTruthy()
  })

  it('o período escolhido vai para a chamada das métricas', () => {
    render(<RoutineAgentsPage />)
    fireEvent.click(screen.getByRole('radio', { name: '7 dias' }))
    expect(mocks.metricsParams.at(-1)).toEqual({ periodo: '7d' })
  })

  it('motor e status reduzem a lista; sem resultado mostra o vazio com Limpar', () => {
    render(<RoutineAgentsPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'OpenCode' }))
    expect(screen.getAllByTestId(/routine-agent-row-/).map((row) => row.dataset.testid)).toEqual(['routine-agent-row-Vagas'])
    act(() => window.history.replaceState(null, '', '/agentes-rotineiros?motor=opex&status=paused'))
    cleanup()
    render(<RoutineAgentsPage />)
    expect(screen.getByText('Nenhum agente com esses filtros')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpar filtros' }).at(-1)!)
    expect(screen.getAllByTestId(/routine-agent-row-/)).toHaveLength(3)
  })

  it('filtros puros: busca tolera erro de digitação; status do provisionamento vence o do agente', () => {
    const agents = mocks.agents as RoutineAgentDto[]
    expect(filterRoutineAgents(agents, { busca: 'indexdor', status: [], motor: 'all' }).map((item) => item.id)).toEqual(['Indexador'])
    expect(filterRoutineAgents(agents, { busca: '', status: ['provisioning_error'], motor: 'all' }).map((item) => item.id)).toEqual(['Novo'])
    expect(routineListStatusOf(agent('x', { status: 'paused', provisioning: { ...agent('x').provisioning, status: 'running' } }))).toBe('provisioning')
  })
})

describe('critério aprovado (OPE-130, D19/D20): cabeçalho e Configurar da página do agente', () => {
  it('os botões ficam juntos na linha do título (sem quebra entre si) e a descrição fica abaixo', () => {
    render(
      <AgentPageHeader icon={Bot} title="Agente Indexador" description={'Objetivo longo '.repeat(30)} onSettings={() => {}}>
        <button type="button">Executar agora</button>
      </AgentPageHeader>,
    )
    const actions = screen.getByTestId('agent-page-actions')
    expect(actions.classList.contains('flex-nowrap')).toBe(true)
    expect(actions.classList.contains('shrink-0')).toBe(true)
    const titleRow = screen.getByRole('heading', { name: 'Agente Indexador' }).parentElement!
    expect(titleRow.contains(actions)).toBe(true)
    expect(titleRow.contains(screen.getByText(/Objetivo longo/))).toBe(false)
  })

  it('com onSettings, "Configurar" é botão; sem ele, continua o link da integração', () => {
    const onSettings = vi.fn()
    render(<AgentPageHeader icon={Bot} title="A" description="d" onSettings={onSettings} />)
    fireEvent.click(screen.getByRole('button', { name: /Configurar/ }))
    expect(onSettings).toHaveBeenCalled()
    cleanup()
    render(<AgentPageHeader icon={Bot} title="A" description="d" settingsHref="/integracoes/ia?aba=x" />)
    expect(screen.getByRole('link', { name: /Configurar/ }).getAttribute('href')).toBe('/integracoes/ia?aba=x')
  })

  it('"Configurar" abre o editor na própria página (?configurar=1), sem navegar; fechar tira o parâmetro', () => {
    window.history.replaceState(null, '', '/agentes-rotineiros/Indexador')
    render(<RoutineAgentPage id="Indexador" />)
    expect(screen.queryByRole('dialog', { name: 'Editor do agente' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Configurar/ }))
    expect(screen.getByRole('dialog', { name: 'Editor do agente' }).textContent).toContain('Indexador')
    expect(window.location.search).toContain('configurar=1')
    expect(mocks.push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar editor' }))
    expect(screen.queryByRole('dialog', { name: 'Editor do agente' })).toBeNull()
    expect(window.location.search).not.toContain('configurar')
  })
})

describe('OPE-160: voltar, "Conversar" e a conversa na Visão geral', () => {
  it('a seta de voltar fica antes do ícone e leva para a lista dos rotineiros', () => {
    window.history.replaceState(null, '', '/agentes-rotineiros/Indexador')
    render(<RoutineAgentPage id="Indexador" />)
    const back = screen.getByRole('link', { name: 'Voltar para os agentes rotineiros' })
    expect(back.getAttribute('href')).toBe('/agentes-rotineiros')
    const header = back.closest('header')!
    expect(header.firstElementChild?.contains(back)).toBe(true)
  })

  it('sem backHref o cabeçalho não muda', () => {
    render(<AgentPageHeader icon={Bot} title="A" description="d" />)
    expect(screen.queryByTestId('agent-page-back')).toBeNull()
  })

  it('a Visão geral tem as métricas e a conversa; "Conversar" volta para ela a partir de outra aba', () => {
    window.history.replaceState(null, '', '/agentes-rotineiros/Indexador?aba=segredos')
    render(<RoutineAgentPage id="Indexador" />)
    expect(screen.queryByTestId('routine-chat')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Conversar/ }))
    const layout = screen.getByTestId('routine-overview-layout')
    expect(layout.textContent).toContain('visão geral')
    const chat = screen.getByTestId('routine-chat')
    expect(layout.contains(chat)).toBe(true)
    // A coluna recebe o id do agente da página (as rotas da conversa usam o id, nunca o slug).
    expect(chat.getAttribute('data-agent-id')).toBe('Indexador')
    expect(chat.getAttribute('data-agent-title')).toBe('Agente Indexador')
  })

  it('"Conversar" desabilitado com o motivo no motor OpenCode e com o agente pausado', () => {
    mocks.agents = [agent('Host', { engine: 'opencode' }), agent('Parado', { status: 'paused' })]
    window.history.replaceState(null, '', '/agentes-rotineiros/Host')
    render(<RoutineAgentPage id="Host" />)
    let button = screen.getByRole('button', { name: /Conversar/ })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('title')).toMatch(/só no motor Opex/)
    cleanup()
    render(<RoutineAgentPage id="Parado" />)
    button = screen.getByRole('button', { name: /Conversar/ })
    expect(button.getAttribute('title')).toBe('Retome o agente para conversar')
  })
})
