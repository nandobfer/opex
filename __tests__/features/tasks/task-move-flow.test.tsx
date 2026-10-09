/** @vitest-environment jsdom */

import React from 'react'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
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
import { MoveUrlDialog } from '@/features/tasks/components/MoveUrlDialog'

const task: TaskDto = {
  id: 'a'.repeat(24),
  code: 'GO-DEV-7',
  title: 'Tarefa',
  status: 'development',
  order: 1,
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
}

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const list: TaskListDto = { tasks: [task], baseUrl: 'https://go', currentUserId: null, fetchedAt: '' }
  client.setQueryData(taskListKey(false), list)
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, wrapper }
}

const statusOf = (client: QueryClient) => client.getQueryData<TaskListDto>(taskListKey(false))!.tasks[0]!.status
const rejectWith = (status: number, data: unknown) => new AxiosError(String(status), 'ERR', undefined, undefined, { status, data } as never)

beforeEach(() => vi.clearAllMocks())

describe('fluxo de mudança de status', () => {
  it('muda na hora (otimista) e confirma com a plataforma', async () => {
    const { client, wrapper } = setup()
    let resolve!: (value: unknown) => void
    mocks.post.mockReturnValue(new Promise((r) => (resolve = r)))
    const { result } = renderHook(() => useTaskMoveFlow(buildBoardColumns(undefined)), { wrapper })
    act(() => result.current.move(task, 'specification'))
    await waitFor(() => expect(statusOf(client)).toBe('specification'))
    expect(mocks.post).toHaveBeenCalledWith(`/tasks/${task.id}/move`, expect.objectContaining({ targetStatus: 'specification', fromStatus: 'development', code: 'GO-DEV-7' }))
    await act(async () => resolve({ data: { success: true, data: { ...task, status: 'specification' } } }))
    expect(mocks.toastSuccess).toHaveBeenCalled()
  })

  it('falha volta o card e mostra o erro', async () => {
    const { client, wrapper } = setup()
    mocks.post.mockRejectedValue(rejectWith(502, { success: false, error: 'O Go! Sipal não respondeu a tempo' }))
    const { result } = renderHook(() => useTaskMoveFlow(buildBoardColumns(undefined)), { wrapper })
    await act(async () => result.current.move(task, 'prioritized'))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('O Go! Sipal não respondeu a tempo'))
    expect(statusOf(client)).toBe('development')
  })

  it('Validação sem commit: pede a URL antes de chamar a plataforma; Em Produção é travado', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useTaskMoveFlow(buildBoardColumns(undefined)), { wrapper })
    act(() => result.current.move(task, 'validation'))
    expect(result.current.pending).toMatchObject({ requires: 'commit', targetStatus: 'validation' })
    expect(mocks.post).not.toHaveBeenCalled()

    act(() => result.current.move({ ...task, status: 'in_production' }, 'backlog'))
    expect(mocks.toastError).toHaveBeenCalledWith('Tarefas em Produção não voltam para outras colunas do Go! Sipal')
  })

  it('plataforma pede PR: abre o diálogo em vez do toast', async () => {
    const { wrapper } = setup()
    mocks.post.mockRejectedValue(rejectWith(400, { success: false, error: 'URL do Pull Request é obrigatória', details: { requiresPullRequestUrl: true } }))
    const { result } = renderHook(() => useTaskMoveFlow(buildBoardColumns(undefined)), { wrapper })
    await act(async () => result.current.move({ ...task, taskType: 'analysis' }, 'awaiting_production'))
    await waitFor(() => expect(result.current.pending?.requires).toBe('pullRequest'))
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})

describe('rascunho (issue do GitHub)', () => {
  const draft: TaskDto = { ...task, id: `draft-${'b'.repeat(24)}`, code: 'app#12', status: 'backlog', localColumn: 'custom-entrada01', draft: { id: 'b'.repeat(24), repo: 'sipal/app', number: 12, issueClosed: false } }

  it('coluna do Go! Sipal criável abre a confirmação de envio (sem chamar o servidor); Validação é recusada', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useTaskMoveFlow(buildBoardColumns(undefined)), { wrapper })
    act(() => result.current.move(draft, 'specification'))
    expect(result.current.sendRequest).toEqual({ task: draft, status: 'specification' })
    expect(mocks.post).not.toHaveBeenCalled()
    act(() => result.current.closeSend())
    expect(result.current.sendRequest).toBeNull()

    act(() => result.current.move(draft, 'validation'))
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Rascunhos só podem ser enviados'))
    expect(result.current.sendRequest).toBeNull()
  })

  it('entre colunas pessoais move normalmente (local)', async () => {
    const { wrapper } = setup()
    mocks.post.mockResolvedValue({ data: { success: true, data: null } })
    const { result } = renderHook(() => useTaskMoveFlow(buildBoardColumns(undefined)), { wrapper })
    await act(async () => result.current.move(draft, 'custom-outra00'))
    expect(mocks.post).toHaveBeenCalledWith(`/tasks/${draft.id}/move`, expect.objectContaining({ targetColumn: 'custom-outra00' }))
  })
})

describe('MoveUrlDialog', () => {
  it('valida o link do commit e confirma', async () => {
    const onConfirm = vi.fn(async () => true)
    render(<MoveUrlDialog request={{ key: 'k', subject: task.code, currentUrl: null, targetStatus: 'validation', requires: 'commit' }} submitting={false} error={null} onConfirm={onConfirm} onCancel={vi.fn()} />)
    const input = screen.getByLabelText('URL do commit')
    const submit = screen.getByRole('button', { name: /Mover tarefa/ })

    await act(async () => fireEvent.change(input, { target: { value: 'https://github.com/o/r/pull/1' } }))
    await waitFor(() => expect(screen.getByText(/Informe o link de um commit/)).toBeTruthy())
    expect(submit.hasAttribute('disabled')).toBe(true)

    await act(async () => fireEvent.change(input, { target: { value: 'https://github.com/o/r/commit/abc123' } }))
    await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false))
    await act(async () => fireEvent.click(submit))
    expect(onConfirm).toHaveBeenCalledWith('https://github.com/o/r/commit/abc123')
  })
})
