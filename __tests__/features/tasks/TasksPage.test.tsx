/** @vitest-environment jsdom */

import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDto } from '@/features/tasks/types'
import { clearStorage } from '../../helpers/hooks'

const mocks = vi.hoisted(() => ({
  list: { data: undefined as unknown, isLoading: false, isError: false, isFetching: false, error: null as unknown },
  push: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/features/tasks/hooks/useTasks', async (original) => ({
  ...(await original<typeof import('@/features/tasks/hooks/useTasks')>()),
  useTaskList: () => mocks.list,
  useTaskOptions: () => ({ data: { products: [], developers: [] }, isFetching: false }),
  useTasksRealtime: vi.fn(),
}))
vi.mock('@/features/tasks/hooks/useTaskBoard', async () => {
  const { buildBoardColumns } = await import('@/features/tasks/board')
  const board = { columns: [{ key: 'custom-aaaaaa', name: 'Aguardando', color: 'amber', icon: 'hourglass', description: 'Esperando retorno', wipLimit: null }], layout: ['backlog', 'custom-aaaaaa'] }
  return {
    taskBoardKey: ['tasks', 'board'],
    useTaskBoard: () => ({ data: board, columns: buildBoardColumns(board as never) }),
    useColumnMutations: () => ({ create: { isPending: false }, update: { isPending: false }, remove: { mutate: vi.fn() }, reorder: { mutate: vi.fn() } }),
  }
})

import { TasksPage } from '@/features/tasks/components/TasksPage'

const task = (overrides: Partial<TaskDto>): TaskDto => ({
  id: 'a'.repeat(24),
  code: 'GO-DEV-1',
  title: 'Primeira',
  status: 'backlog',
  order: 0,
  taskType: 'feature',
  priority: 'medium',
  product: null,
  workPackage: null,
  assignee: null,
  commitUrl: null,
  pullRequestUrl: null,
  archived: false,
  createdAt: null,
  updatedAt: null,
  ...overrides,
})

const renderPage = () => {
  const client = new QueryClient()
  client.invalidateQueries = mocks.invalidate as never
  return render(
    <QueryClientProvider client={client}>
      <TasksPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  clearStorage()
  mocks.list = {
    data: {
      tasks: [task({}), task({ id: 'b'.repeat(24), code: 'GO-DEV-2', title: 'Em produção', status: 'in_production' })],
      baseUrl: 'https://go',
      currentUserId: null,
      fetchedAt: '2026-10-08T12:00:00Z',
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null,
  }
})

describe('TasksPage', () => {
  it('kanban com as 7 colunas do Go! Sipal; clicar no card abre a página da tarefa', () => {
    renderPage()
    for (const name of ['Backlog', 'Aguardando', 'Priorizado', 'Especificação', 'Desenvolvimento', 'Validação', 'Aguardando Produção', 'Em Produção']) {
      expect(screen.getByRole('region', { name })).toBeTruthy()
    }
    const backlog = screen.getByRole('region', { name: 'Backlog' })
    fireEvent.click(within(backlog).getByRole('button', { name: /GO-DEV-1/ }))
    expect(mocks.push).toHaveBeenCalledWith(`/tarefas/${'a'.repeat(24)}`)
  })

  it('colunas do Go! Sipal com selo; coluna pessoal no lugar escolhido; botão Nova coluna', () => {
    renderPage()
    const regions = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))
    expect(regions.slice(0, 3)).toEqual(['Backlog', 'Aguardando', 'Priorizado'])
    expect(within(screen.getByRole('region', { name: 'Backlog' })).getByText('Go! Sipal')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Aguardando' })).getByText('Pessoal')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Arrastar a coluna Aguardando' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Arrastar a coluna Backlog' })).toBeNull()
    expect(screen.getByRole('button', { name: /Nova coluna$/ })).toBeTruthy()
  })

  it('tarefa na coluna pessoal mostra o status real do Go! Sipal', () => {
    mocks.list = { ...mocks.list, data: { ...(mocks.list.data as object), tasks: [task({ localColumn: 'custom-aaaaaa', localOrder: 0 })] } }
    renderPage()
    const column = screen.getByRole('region', { name: 'Aguardando' })
    expect(within(column).getByText('GO-DEV-1')).toBeTruthy()
    expect(within(column).getByTitle('No Go! Sipal: Backlog')).toBeTruthy()
  })

  it('alternar para Tabela fica salvo no navegador', () => {
    const { unmount } = renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /Tabela/ }))
    expect(screen.getByRole('columnheader', { name: /Código/ })).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem('opex:tasks-filters:v1')!).view).toBe('table')
    unmount()
    renderPage()
    expect(screen.getByRole('columnheader', { name: /Código/ })).toBeTruthy()
  })

  it('Atualizar recarrega as tarefas', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar tarefas' }))
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['tasks'] })
  })

  it('sem sessão do Go! Sipal: convida a conectar, sem filtros', () => {
    mocks.list = {
      ...mocks.list,
      data: undefined,
      isError: true,
      error: new AxiosError('401', 'ERR', undefined, undefined, { status: 401, data: { success: false, error: 'Go! Sipal sem sessão', code: 'GO_SIPAL_SESSION' } } as never),
    }
    renderPage()
    expect(screen.getByText('Conecte-se ao Go! Sipal')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Conectar ao Go! Sipal' }).getAttribute('href')).toBe('/integracoes/go_sipal')
    expect(screen.queryByLabelText('Busca')).toBeNull()
  })

  it('filtros sem resultado mostram "Limpar filtros"', async () => {
    window.localStorage.setItem('opex:tasks-filters:v1', JSON.stringify({ priorities: ['urgent'] }))
    renderPage()
    expect(screen.getByText('Nenhuma tarefa com estes filtros')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Limpar filtros' }).at(-1)!))
    expect(screen.getByRole('region', { name: 'Backlog' })).toBeTruthy()
  })
})
