/** @vitest-environment jsdom */

import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDto } from '@/features/tasks/types'

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
  useTaskOptions: () => ({ data: { projects: [{ id: 'p1', name: 'Portal', repo: 'o/portal', sigla: 'POR' }] }, isFetching: false, isError: false }),
  useTasksRealtime: vi.fn(),
}))
vi.mock('@/features/tasks/hooks/useTaskBoard', async () => {
  const { buildBoardColumns } = await import('@/features/tasks/board')
  const board = {
    columns: [
      { key: 'todo', name: 'A Fazer', color: 'zinc', icon: 'inbox', description: null, wipLimit: null },
      { key: 'col-1', name: 'Aguardando', color: 'amber', icon: 'hourglass', description: 'Esperando retorno', wipLimit: null },
    ],
    layout: ['todo', 'col-1'],
  }
  return {
    taskBoardKey: ['tasks', 'board'],
    useTaskBoard: () => ({ data: board, columns: buildBoardColumns(board as never) }),
    useColumnMutations: () => ({ create: { isPending: false }, update: { isPending: false }, remove: { mutate: vi.fn() }, reorder: { mutate: vi.fn() } }),
  }
})

import { TasksPage } from '@/features/tasks/components/TasksPage'

const task = (overrides: Partial<TaskDto>): TaskDto => ({
  id: 'a'.repeat(24),
  code: 'OPX-1',
  columnId: 'todo',
  order: 0,
  title: 'Primeira',
  taskType: 'feature',
  priority: 'medium',
  archived: false,
  project: { id: 'p1', name: 'Portal', repo: 'o/portal', sigla: 'POR' },
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
  window.localStorage.clear()
  mocks.list = {
    data: { tasks: [task({}), task({ id: 'b'.repeat(24), code: 'OPX-2', title: 'Aguardando cliente', columnId: 'col-1' })], fetchedAt: '2026-10-08T12:00:00Z' },
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null,
  }
})

describe('TasksPage', () => {
  it('kanban com as colunas; clicar no card abre a página da tarefa', () => {
    renderPage()
    for (const name of ['A Fazer', 'Aguardando']) expect(screen.getByRole('region', { name })).toBeTruthy()
    const todo = screen.getByRole('region', { name: 'A Fazer' })
    fireEvent.click(within(todo).getByRole('button', { name: /OPX-1/ }))
    expect(mocks.push).toHaveBeenCalledWith(`/tarefas/${'a'.repeat(24)}`)
  })

  it('todas as colunas arrastam pela alça e há "Nova coluna"', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Arrastar a coluna A Fazer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Arrastar a coluna Aguardando' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Nova coluna$/ })).toBeTruthy()
  })

  it('Nova tarefa navega para a página de criação', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Nova tarefa/ }))
    expect(mocks.push).toHaveBeenCalledWith('/tarefas/nova')
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

  it('erro mostra o aviso com tentar novamente', () => {
    mocks.list = { ...mocks.list, data: undefined, isError: true, error: new AxiosError('500', 'ERR', undefined, undefined, { status: 500, data: { success: false, error: 'Falha' } } as never) }
    renderPage()
    expect(screen.getByText('Não foi possível carregar as tarefas')).toBeTruthy()
  })

  it('filtros sem resultado mostram "Limpar filtros"', async () => {
    window.localStorage.setItem('opex:tasks-filters:v1', JSON.stringify({ priorities: ['urgent'] }))
    renderPage()
    expect(screen.getByText('Nenhuma tarefa com estes filtros')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Limpar filtros' }).at(-1)!))
    expect(screen.getByRole('region', { name: 'A Fazer' })).toBeTruthy()
  })
})
