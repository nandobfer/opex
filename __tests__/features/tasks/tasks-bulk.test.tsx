/** @vitest-environment jsdom */

import React from 'react'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersonRef, TaskDto, TaskListDto } from '@/features/tasks/types'

const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { post: mocks.post, get: vi.fn(), patch: vi.fn() } }))
vi.mock('sonner', () => ({ toast: mocks.toast }))

import { bulkMoveUrlNeed, planBulkArchive, planBulkAssign, planBulkMove, planBulkPriority } from '@/features/tasks/bulk-items'
import { useBulkTasks } from '@/features/tasks/hooks/useBulkTasks'
import { taskListKey } from '@/features/tasks/hooks/useTasks'
import { useTaskSelection } from '@/features/tasks/hooks/useTaskSelection'
import { TaskTable } from '@/features/tasks/components/TaskTable'
import { TaskBulkBar } from '@/features/tasks/components/TaskBulkBar'
import { buildBoardColumns } from '@/features/tasks/board'

const fer: PersonRef = { id: 'u1', name: 'Fer', email: null }
const ana: PersonRef = { id: 'u2', name: 'Ana', email: null }

const task = (id: string, overrides: Partial<TaskDto> = {}): TaskDto => ({
  id,
  code: `GO-DEV-${id}`,
  title: `Tarefa ${id}`,
  status: 'development',
  order: Number(id),
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

beforeEach(() => vi.clearAllMocks())

describe('montagem dos lotes', () => {
  it('mover: pula as que já estão lá e as em Produção; URL só para quem precisa; desfazer volta status e ordem', () => {
    const tasks = [task('1'), task('2', { taskType: 'analysis' }), task('3', { status: 'validation' }), task('4', { status: 'in_production' })]
    expect(bulkMoveUrlNeed(tasks, 'validation')).toEqual({ requires: 'commit', count: 1 })
    const plan = planBulkMove(tasks, 'validation', 'https://github.com/o/r/commit/abc')
    expect(plan.items.map((item) => item.task.id)).toEqual(['1', '2'])
    expect(plan.items[0]!.action).toMatchObject({ type: 'move', targetStatus: 'validation', commitUrl: 'https://github.com/o/r/commit/abc' })
    expect(plan.items[1]!.action).toMatchObject({ commitUrl: undefined })
    expect(plan.items[0]!.undo).toEqual({ action: { type: 'move', targetStatus: 'development', order: 1 }, patch: { status: 'development', order: 1 } })
    expect(plan.note).toMatch(/1 em Produção/)
    expect(planBulkMove([task('1')], 'in_production').items[0]!.undo).toBeNull()
  })

  it('atribuir, prioridade e arquivar: só quem muda, com o valor anterior no desfazer', () => {
    const tasks = [task('1', { assignee: fer }), task('2', { assignee: ana, priority: 'urgent', archived: true })]
    const assign = planBulkAssign(tasks, fer)
    expect(assign.items.map((item) => item.task.id)).toEqual(['2'])
    expect(assign.items[0]!.undo?.action).toEqual({ type: 'assign', assignee: 'u2', assigneeName: 'Ana' })
    expect(planBulkAssign(tasks, null).items).toHaveLength(2)
    expect(planBulkPriority(tasks, 'urgent').items.map((item) => item.task.id)).toEqual(['1'])
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
    rerender({ ids: ['a', 'b', 'c', 'd'] })
    expect([...result.current.selected]).toEqual(['a', 'b'])
    act(() => result.current.clear())
    expect(result.current.selected.size).toBe(0)
  })
})

describe('useBulkTasks', () => {
  const setup = (tasks: TaskDto[]) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const list: TaskListDto = { tasks, baseUrl: 'https://go', currentUserId: null, fetchedAt: '' }
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
    expect(mocks.toast.warning).toHaveBeenCalledWith('Prioridade urgente: 4 atualizada(s), 1 com falha', expect.objectContaining({ description: expect.stringContaining('GO-DEV-2: Recusada') }))
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
          columns={buildBoardColumns(undefined)}
          sort={{ column: 'code', direction: 'asc' }}
          onSortChange={vi.fn()}
          currentUserId="u1"
          movingId={null}
          updatingId={null}
          people={[fer, ana]}
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar GO-DEV-2' }))
    expect(screen.getByTestId('count').textContent).toBe('2')
    expect(screen.getByRole('checkbox', { name: 'Selecionar todas' }).getAttribute('aria-checked')).toBe('mixed')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('Shift+clique marca o intervalo', () => {
    render(<Harness onUpdate={vi.fn()} onOpen={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar GO-DEV-1' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar GO-DEV-3' }), { shiftKey: true })
    expect(screen.getByTestId('count').textContent).toBe('3')
  })

  it('prioridade e responsável abrem o seletor sem abrir a tarefa', () => {
    const onOpen = vi.fn()
    render(<Harness onUpdate={vi.fn()} onOpen={onOpen} />)
    const row = screen.getByRole('row', { name: 'Abrir GO-DEV-1' })
    fireEvent.click(within(row).getByRole('button', { name: 'Prioridade: alterar' }))
    fireEvent.click(within(row).getByRole('button', { name: 'Responsável: alterar' }))
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('TaskBulkBar', () => {
  it('aparece com a contagem; Desarquivar quando todas estão arquivadas; × limpa', () => {
    const onClear = vi.fn()
    const props = { columns: buildBoardColumns(undefined), people: [fer], currentUserId: 'u1', progress: null, onMove: vi.fn(), onAssign: vi.fn(), onPriority: vi.fn(), onArchive: vi.fn(), onClear }
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

