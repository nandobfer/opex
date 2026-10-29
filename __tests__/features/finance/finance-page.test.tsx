/** @vitest-environment happy-dom */

import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinanceByClientDto } from '@/features/finance/types'

const mocks = vi.hoisted(() => ({
  query: { data: undefined as unknown, isLoading: false, isError: false, isFetching: false, error: null as unknown, refetch: vi.fn() },
  filters: null as unknown,
  clients: { data: [] as unknown[] },
  taskOptions: { data: { projects: [] as unknown[] } },
}))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/finance/hooks/useFinance', () => ({
  useFinanceByClient: (filters: unknown) => {
    mocks.filters = filters
    return mocks.query
  },
  useFinanceRealtime: vi.fn(),
}))
vi.mock('@/features/orcamentos/hooks/useOrcamentos', () => ({
  useOrcamentoClients: () => mocks.clients,
  orcamentoClientsKey: ['orcamentos', 'clients'],
}))
vi.mock('@/features/tasks/hooks/useTasks', () => ({
  useTaskOptions: () => mocks.taskOptions,
  TASKS_QUERY_KEY: 'tasks',
}))

import { FinancePage } from '@/features/finance/components/FinancePage'

const data = (): FinanceByClientDto => ({
  from: null,
  to: null,
  groups: [
    {
      clientId: 'c1',
      clientName: 'Acme',
      taskCount: 1,
      serviceCount: 0,
      totalHours: 2,
      totalClientHours: 4,
      totalBillingBrl: 400,
      tasks: [
        {
          kind: 'task',
          id: 'a'.repeat(24),
          code: 'AP-1',
          title: 'Portal interno',
          project: { id: 'p1', name: 'Portal', repo: 'o/portal', sigla: 'POR' },
          hours: 2,
          clientHours: 4,
          billingBrl: 400,
          completedAt: '2026-10-05T12:00:00.000Z',
        },
      ],
    },
  ],
  totals: { taskCount: 1, serviceCount: 0, totalHours: 2, totalClientHours: 4, totalBillingBrl: 400 },
})

const serviceData = (): FinanceByClientDto => ({
  from: null,
  to: null,
  groups: [
    {
      clientId: 'c1',
      clientName: 'Acme',
      taskCount: 0,
      serviceCount: 1,
      totalHours: 1,
      totalClientHours: 2,
      totalBillingBrl: 200,
      tasks: [
        {
          kind: 'service',
          id: 's'.repeat(24),
          code: 'SRV-1',
          title: 'Consultoria',
          project: null,
          hours: 1,
          clientHours: 2,
          billingBrl: 200,
          serviceDate: '2026-10-08T00:00:00.000Z',
          taskId: null,
          archived: false,
        },
      ],
    },
  ],
  totals: { taskCount: 0, serviceCount: 1, totalHours: 1, totalClientHours: 2, totalBillingBrl: 200 },
})

const emptyData = (): FinanceByClientDto => ({ ...data(), groups: [], totals: { taskCount: 0, serviceCount: 0, totalHours: 0, totalClientHours: 0, totalBillingBrl: 0 } })

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FinancePage />
    </QueryClientProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/financeiro')
  mocks.query = { data: data(), isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn() }
  mocks.filters = null
  mocks.clients = { data: [{ id: 'c1', name: 'Acme', active: true }] }
  mocks.taskOptions = { data: { projects: [{ id: 'p1', name: 'Portal', repo: 'o/portal', sigla: 'POR' }] } }
})

describe('FinancePage', () => {
  it('mostra o faturamento do período e o grupo por cliente', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Financeiro' })).toBeTruthy()
    expect(screen.getAllByText('R$ 400,00').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Acme/ })).toBeTruthy()
  })

  it('renderiza os filtros de Período, Clientes e Repositórios', () => {
    renderPage()
    expect(screen.getByText('Período')).toBeTruthy()
    expect(screen.getByText('Clientes')).toBeTruthy()
    expect(screen.getByText('Repositórios')).toBeTruthy()
    expect(screen.getByText('1 REGISTROS')).toBeTruthy()
  })

  it('oferece o botão Novo serviço, o filtro de arquivados e o contador de Serviços', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /Novo serviço/ }).getAttribute('href')).toBe('/financeiro/servicos/novo')
    expect(screen.getByLabelText('Mostrar serviços arquivados')).toBeTruthy()
    expect(screen.getByTestId('finance-total-services')).toBeTruthy()
  })

  it('lista um serviço com badge e link para o detalhe', async () => {
    mocks.query = { ...mocks.query, data: serviceData() }
    renderPage()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Acme/ }))
    })
    expect(screen.getByText('Serviço')).toBeTruthy()
    expect(screen.getByText('SRV-1').getAttribute('href')).toBe(`/financeiro/servicos/${'s'.repeat(24)}`)
  })

  it('lê clientes e repositórios da URL e consulta o financeiro com eles', () => {
    const clientId = 'a'.repeat(24)
    const projectId = 'b'.repeat(24)
    window.history.replaceState(null, '', `/financeiro?clientIds=${clientId}&projectIds=${projectId}`)
    renderPage()
    expect(mocks.filters).toMatchObject({ clientIds: [clientId], projectIds: [projectId] })
  })

  it('sem resultados com filtros ativos mostra o aviso específico com a ação de limpar', () => {
    window.history.replaceState(null, '', `/financeiro?clientIds=${'a'.repeat(24)}`)
    mocks.query = { ...mocks.query, data: emptyData() }
    renderPage()
    expect(screen.getByText('Nenhum item para os filtros selecionados')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Limpar seleção' })).toBeTruthy()
  })

  it('expande o cliente para listar as tarefas concluídas', async () => {
    renderPage()
    expect(screen.queryByText('Portal interno')).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Acme/ }))
    })

    expect(screen.getByText('Portal interno')).toBeTruthy()
    expect(screen.getByText('AP-1')).toBeTruthy()
    expect(screen.getByText('o/portal')).toBeTruthy()
  })

  it('sem tarefas concluídas mostra o estado vazio', () => {
    mocks.query = { ...mocks.query, data: emptyData() }
    renderPage()
    expect(screen.getByText('Nenhuma tarefa concluída ou serviço neste período')).toBeTruthy()
  })

  it('erro mostra o aviso com tentar novamente', () => {
    mocks.query = { ...mocks.query, data: undefined, isError: true, error: new Error('falha') }
    renderPage()
    expect(screen.getByText('Não foi possível carregar o financeiro')).toBeTruthy()
  })

  it('no celular as métricas do grupo e os valores da tarefa vão para uma linha própria', async () => {
    renderPage()
    expect(screen.getByTestId('finance-group-metrics').className).toContain('max-md:basis-full')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Acme/ }))
    })
    const values = await screen.findByTestId('finance-task-values')
    expect(values.className).toContain('max-md:basis-full')
  })
})
