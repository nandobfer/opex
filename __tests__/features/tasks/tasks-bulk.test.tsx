/** @vitest-environment jsdom */

import React from 'react'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDto, TaskListDto } from '@/features/tasks/types'

const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { post: mocks.post, get: vi.fn(), patch: vi.fn() } }))
vi.mock('sonner', () => ({ toast: mocks.toast }))

import { planBulkArchive, planBulkMove, planBulkPriority } from '@/features/tasks/bulk-items'
import { useBulkTasks } from '@/features/tasks/hooks/useBulkTasks'
import { taskListKey } from '@/features/tasks/hooks/useTasks'
import { useTaskSelection } from '@/features/tasks/hooks/useTaskSelection'
import { TaskTable } from '@/features/tasks/components/TaskTable'
import { TaskBulkBar } from '@/features/tasks/components/TaskBulkBar'
import { buildBoardColumns } from '@/features/tasks/board'

const board = {
  columns: [
    { key: 'todo', name: 'A Fazer', color: 'zinc' as const, icon: 'inbox' as const, description: null, wipLimit: null },
    { key: 'doing', name: 'Em Andamento', color: 'sky' as const, icon: 'clock' as const, description: null, wipLimit: null },
  ],
  layout: ['todo', 'doing'],
}

const task = (id: string, overrides: Partial<TaskDto> = {}): TaskDto => ({
  id,
  code: `OPX-${id}`,
  columnId: 'todo',
  order: Number(id),
  title: `Tarefa ${id}`,
  taskType: 'feature',
  priority: 'medium',
  archived: false,
  project: null,
  createdAt: null,
  updatedAt: null,
  ...overrides,
})

beforeEach(() => vi.clearAllMocks())

describe('montagem dos lotes', () => {
  it('mover: pula as que já estão lá; desfazer volta coluna e ordem', () => {
    const tasks = [task('1'), task('2', { columnId: 'doing', order: 5 })]
    const plan = planBulkMove(tasks, 'doing')
    expect(plan.items.map((item) => item.task.id)).toEqual(['1'])
    expect(plan.items[0]!.action).toEqual({ type: 'move', column: 'doing' })
    expect(plan.items[0]!.undo).toEqual({ action: { type: 'move', column: 'todo' }, patch: { columnId: 'todo', order: 1 } })
  })

  it('prioridade e arquivar: só quem muda, com o valor anterior no desfazer', () => {
    const tasks = [task('1'), task('2', { priority: 'urgent', archived: true })]
    expect(planBulkPriority(tasks, 'urgent').items.map((item) => item.task.id)).toEqual(['1'])
    expect(planBulkPriority(tasks, 'urgent').items[0]!.undo?.action).toEqual({ type: 'priority', priority: 'medium' })
    expect(planBulkArchive(tasks, true).items.map((item) => item.task.id)).toEqual(['1'])
  })
})

describe('useTaskSelection', () => {
  it('Shift marca o intervalo; setMany e stateOf (parcial); some do filtro → sai da seleção', () => {
    const { result, rerender } = renderHook(({ ids }) => useTaskSelection(ids), { initialProps: { ids: ['a', 'b', 'c', 'd'] } })
    const ordered = ['a', 'b', 'c', 'd']
    act(() => result.current.toggle('a', { ordered }))
    act(() => result.current.toggle('c', { shift: true, ordered }))
    expect([...result.current.selected]).toEqual(['a', 'b', 'c'])
    expect(result.current.stateOf(ordered)).toBe('mixed')
    act(() => result.current.setMany(ordered, true))
    expect(result.current.stateOf(ordered)).toBe(true)
    rerender({ ids: ['a', 'b'] })
    expect([...result.current.selected]).toEqual(['a', 'b'])
    act(() => result.current.clear())
    expect(result.current.selected.size).toBe(0)
  })
})

describe('useBulkTasks', () => {
  const setup = (tasks: TaskDto[]) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const list: TaskListDto = { tasks, fetchedAt: '' }
    client.setQueryData(taskListKey(false), list)
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    return { client, wrapper, priorities: () => client.getQueryData<TaskListDto>(taskListKey(false))!.tasks.map((t) => t.priority) }
  }

  it('em pedaços de 4, reverte só as que falharam e oferece Desfazer das que deram certo', async () => {
    const tasks = ['1', '2', '3', '4', '5'].map((id) => task(id))
    const { wrapper, priorities } = setup(tasks)
    mocks.post.mockImplementation(async (_url: string, body: { items: { id: string }[] }) => ({
      data: { success: true, data: { results: body.items.map((item) => (item.id === '2' ? { id: '2', ok: false, error: 'Recusada' } : { id: item.id, ok: true })) } },
    }))
    const onDone = vi.fn()
    const { result } = renderHook(() => useBulkTasks(), { wrapper })
    await act(async () => {
      await result.current.run('Prioridade urgente', planBulkPriority(tasks, 'urgent').items, { undoable: true, onDone })
    })
    expect(mocks.post).toHaveBeenCalledTimes(2)
    expect(mocks.post.mock.calls[0][1].items).toHaveLength(4)
    expect(priorities()).toEqual(['urgent', 'medium', 'urgent', 'urgent', 'urgent'])
    expect(mocks.toast.warning).toHaveBeenCalledWith('Prioridade urgente: 4 atualizada(s), 1 com falha', expect.objectContaining({ description: expect.stringContaining('OPX-2: Recusada') }))
    expect(onDone.mock.calls[0][0].filter((r: { ok: boolean }) => r.ok)).toHaveLength(4)

    const undo = mocks.toast.warning.mock.calls[0][1].action
    mocks.post.mockClear()
    await act(async () => undo.onClick())
    await waitFor(() => expect(mocks.post).toHaveBeenCalled())
    const sent = mocks.post.mock.calls.flatMap((call) => call[1].items)
    expect(sent).toHaveLength(4)
    expect(sent[0].action).toEqual({ type: 'priority', priority: 'medium' })
  })

  it('servidor fora do ar: reverte tudo e avisa', async () => {
    const tasks = [task('1')]
    const { wrapper, priorities } = setup(tasks)
    mocks.post.mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useBulkTasks(), { wrapper })
    await act(async () => {
      await result.current.run('Prioridade alta', planBulkPriority(tasks, 'high').items)
    })
    expect(priorities()).toEqual(['medium'])
    expect(mocks.toast.error).toHaveBeenCalled()
  })
})

describe('TaskTable com seleção e edição na linha', () => {
  const tasks = [task('1'), task('2'), task('3')]
  function Harness({ onUpdate, onOpen }: { onUpdate: () => void; onOpen: () => void }) {
    const selection = useTaskSelection(tasks.map((t) => t.id))
    return (
      <>
        <TaskTable
          tasks={tasks}
          columns={buildBoardColumns(board)}
          sort={{ column: 'code', direction: 'asc' }}
          onSortChange={vi.fn()}
          movingId={null}
          updatingId={null}
          selection={selection}
          onMove={vi.fn()}
          onUpdate={onUpdate}
          onOpen={onOpen}
        />
        <output data-testid="count">{selection.selected.size}</output>
      </>
    )
  }

  it('cabeçalho seleciona todas (e fica parcial); checkbox não abre a tarefa', () => {
    const onOpen = vi.fn()
    render(<Harness onUpdate={vi.fn()} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas' }))
    expect(screen.getByTestId('count').textContent).toBe('3')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar OPX-2' }))
    expect(screen.getByTestId('count').textContent).toBe('2')
    expect(screen.getByRole('checkbox', { name: 'Selecionar todas' }).getAttribute('aria-checked')).toBe('mixed')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('Shift+clique marca o intervalo', () => {
    render(<Harness onUpdate={vi.fn()} onOpen={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar OPX-1' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar OPX-3' }), { shiftKey: true })
    expect(screen.getByTestId('count').textContent).toBe('3')
  })

  it('prioridade abre o seletor sem abrir a tarefa', () => {
    const onOpen = vi.fn()
    render(<Harness onUpdate={vi.fn()} onOpen={onOpen} />)
    const row = screen.getByRole('row', { name: 'Abrir OPX-1' })
    fireEvent.click(within(row).getByRole('button', { name: 'Prioridade: alterar' }))
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('TaskBulkBar', () => {
  it('aparece com a contagem; Desarquivar quando todas estão arquivadas; × limpa', () => {
    const onClear = vi.fn()
    const props = { columns: buildBoardColumns(board), progress: null, onMove: vi.fn(), onPriority: vi.fn(), onArchive: vi.fn(), onClear }
    const { rerender } = render(<TaskBulkBar tasks={[]} {...props} />)
    expect(screen.queryByRole('toolbar')).toBeNull()
    rerender(<TaskBulkBar tasks={[task('1'), task('2')]} {...props} />)
    const bar = screen.getByRole('toolbar', { name: 'Ações das tarefas selecionadas' })
    expect(within(bar).getByText('selecionadas')).toBeTruthy()
    expect(within(bar).getByRole('button', { name: /Arquivar/ })).toBeTruthy()
    rerender(<TaskBulkBar tasks={[task('1', { archived: true })]} {...props} progress={{ label: 'Arquivar', done: 1, total: 3 }} />)
    expect(screen.getByRole('button', { name: /Desarquivar/ })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('1 de 3')
    rerender(<TaskBulkBar tasks={[task('1')]} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }))
    expect(onClear).toHaveBeenCalled()
  })
})
