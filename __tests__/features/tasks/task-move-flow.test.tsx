/** @vitest-environment happy-dom */

import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDto, TaskListDto } from '@/features/tasks/types'

const mocks = vi.hoisted(() => ({ post: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { post: mocks.post, get: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }))

import { useTaskMoveFlow } from '@/features/tasks/hooks/useTaskMoveFlow'
import { buildBoardColumns } from '@/features/tasks/board'
import { taskListKey } from '@/features/tasks/hooks/useTasks'

const board = {
  columns: [
    { key: 'todo', name: 'A Fazer', color: 'zinc' as const, icon: 'inbox' as const, description: null, wipLimit: null },
    { key: 'doing', name: 'Em Andamento', color: 'sky' as const, icon: 'clock' as const, description: null, wipLimit: null },
  ],
  layout: ['todo', 'doing'],
}
const columns = buildBoardColumns(board)

const task: TaskDto = {
  id: 'a'.repeat(24),
  code: 'OPX-7',
  columnId: 'todo',
  order: 0,
  title: 'Tarefa',
  taskType: 'feature',
  priority: 'medium',
  archived: false,
  project: null,
  createdAt: null,
  updatedAt: null,
}

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const list: TaskListDto = { tasks: [task], fetchedAt: '' }
  client.setQueryData(taskListKey(false), list)
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, wrapper }
}

const columnOf = (client: QueryClient) => client.getQueryData<TaskListDto>(taskListKey(false))!.tasks[0]!.columnId
const rejectWith = (status: number, data: unknown) => new AxiosError(String(status), 'ERR', undefined, undefined, { status, data } as never)

beforeEach(() => vi.clearAllMocks())

describe('fluxo de mudança de coluna', () => {
  it('muda na hora (otimista) e confirma com o servidor', async () => {
    const { client, wrapper } = setup()
    let resolve!: (value: unknown) => void
    mocks.post.mockReturnValue(new Promise((r) => (resolve = r)))
    const { result } = renderHook(() => useTaskMoveFlow(columns), { wrapper })
    act(() => result.current.move(task, 'doing'))
    await waitFor(() => expect(columnOf(client)).toBe('doing'))
    expect(mocks.post).toHaveBeenCalledWith(`/tasks/${task.id}/move`, { targetColumn: 'doing', order: undefined })
    await act(async () => resolve({ data: { success: true, data: { ...task, columnId: 'doing' } } }))
    expect(mocks.toastSuccess).toHaveBeenCalled()
  })

  it('falha volta o card e mostra o erro', async () => {
    const { client, wrapper } = setup()
    mocks.post.mockRejectedValue(rejectWith(502, { success: false, error: 'Servidor indisponível' }))
    const { result } = renderHook(() => useTaskMoveFlow(columns), { wrapper })
    await act(async () => result.current.move(task, 'doing'))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Servidor indisponível'))
    expect(columnOf(client)).toBe('todo')
  })

  it('mesma coluna sem posição nova não chama o servidor', () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useTaskMoveFlow(columns), { wrapper })
    act(() => result.current.move(task, 'todo'))
    expect(mocks.post).not.toHaveBeenCalled()
  })
})
