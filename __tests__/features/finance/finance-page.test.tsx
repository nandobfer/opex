/** @vitest-environment jsdom */

import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinanceByClientDto } from '@/features/finance/types'

const mocks = vi.hoisted(() => ({
  query: { data: undefined as unknown, isLoading: false, isError: false, isFetching: false, error: null as unknown, refetch: vi.fn() },
}))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/finance/hooks/useFinance', () => ({
  useFinanceByClient: () => mocks.query,
  useFinanceRealtime: vi.fn(),
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
      totalHours: 2,
      totalClientHours: 4,
      totalBillingBrl: 400,
      tasks: [
        {
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
  totals: { taskCount: 1, totalHours: 2, totalClientHours: 4, totalBillingBrl: 400 },
})

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FinancePage />
    </QueryClientProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.query = { data: data(), isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn() }
})

describe('FinancePage', () => {
  it('mostra o faturamento do período e o grupo por cliente', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Financeiro' })).toBeTruthy()
    expect(screen.getAllByText('R$ 400,00').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Acme/ })).toBeTruthy()
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
    mocks.query = { ...mocks.query, data: { ...data(), groups: [], totals: { taskCount: 0, totalHours: 0, totalClientHours: 0, totalBillingBrl: 0 } } }
    renderPage()
    expect(screen.getByText('Nenhuma tarefa concluída neste período')).toBeTruthy()
  })

  it('erro mostra o aviso com tentar novamente', () => {
    mocks.query = { ...mocks.query, data: undefined, isError: true, error: new Error('falha') }
    renderPage()
    expect(screen.getByText('Não foi possível carregar o financeiro')).toBeTruthy()
  })
})
