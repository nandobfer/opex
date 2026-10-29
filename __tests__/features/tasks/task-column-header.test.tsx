/** @vitest-environment happy-dom */

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import type { TaskDto } from '@/features/tasks/types'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

// Repassa ao virtualizador real e guarda a getItemKey da última chamada.
const virtual = vi.hoisted(() => ({ getItemKey: null as null | ((index: number) => unknown) }))
vi.mock('@tanstack/react-virtual', async (original) => {
  const actual: typeof import('@tanstack/react-virtual') = await original()
  function useVirtualizer(options: Parameters<typeof actual.useVirtualizer>[0]) {
    virtual.getItemKey = options.getItemKey ?? null
    return actual.useVirtualizer(options)
  }
  return { ...actual, useVirtualizer }
})

import { TooltipProvider } from '@/components/ui/tooltip'
import { TaskColumn, columnSortableId } from '@/features/tasks/components/TaskColumn'
import { buildBoardColumns, type TaskColumnDto } from '@/features/tasks/board'
import { useTaskSelection } from '@/features/tasks/hooks/useTaskSelection'

const task = (n: number): TaskDto => ({
  id: String(n).padStart(24, '0'),
  code: `OPX-${n}`,
  columnId: 'col-1',
  order: n,
  title: `Tarefa ${n}`,
  taskType: 'feature',
  priority: 'medium',
  archived: false,
  project: null,
  createdAt: null,
  updatedAt: null,
})

const column = (overrides: Partial<TaskColumnDto> = {}): TaskColumnDto => ({
  key: 'col-1',
  name: 'Revisar',
  color: 'violet',
  icon: 'list',
  description: 'Tarefas que preciso revisar antes de mandar',
  wipLimit: null,
  ...overrides,
})

function Column({ columns, tasks }: { columns: TaskColumnDto[]; tasks: TaskDto[] }) {
  const selection = useTaskSelection(tasks.map((t) => t.id))
  const view = buildBoardColumns({ columns, layout: columns.map((c) => c.key) })[0]!
  return (
    <DndContext>
      <SortableContext items={[columnSortableId(view.key)]}>
        <TooltipProvider>
          <TaskColumn
            column={view}
            tasks={tasks}
            rawCount={tasks.length}
            dragActive={false}
            canShiftLeft={false}
            canShiftRight={false}
            movingId={null}
            selection={selection}
            draggingIds={new Set()}
            actions={{ onCreateAfter: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onShift: vi.fn() }}
            onOpen={vi.fn()}
          />
        </TooltipProvider>
      </SortableContext>
    </DndContext>
  )
}

describe('cabeçalho da coluna (2 linhas)', () => {
  it('2ª linha: checkbox → descrição; sem chip de origem; nome/contador fora da faixa', () => {
    render(<Column columns={[column()]} tasks={[task(1)]} />)
    const meta = screen.getByTestId('column-meta-col-1')
    const checkbox = within(meta).getByRole('checkbox', { name: 'Selecionar todas de Revisar' })
    const description = within(meta).getByTestId('column-description')
    expect(checkbox.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(description.className).toContain('truncate')
    expect(description.className).toContain('text-[10px]')
    expect(within(meta).queryByText('Pessoal')).toBeNull()
    expect(within(meta).queryByText('Revisar')).toBeNull()
  })

  it('descrição: tooltip com o texto inteiro ao passar o mouse', async () => {
    render(<Column columns={[column()]} tasks={[task(1)]} />)
    const description = screen.getByTestId('column-description')
    await act(async () => {
      fireEvent.pointerMove(description)
      fireEvent.focus(description)
    })
    expect((await screen.findByRole('tooltip')).textContent).toBe(column().description)
  })

  it('toda coluna arrasta pela alça e tem menu de ações', () => {
    render(<Column columns={[column()]} tasks={[task(1)]} />)
    expect(screen.getByRole('button', { name: 'Arrastar a coluna Revisar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ações da coluna Revisar' })).toBeTruthy()
  })

  it('coluna vazia: sem checkbox; descrição começa na esquerda', () => {
    render(<Column columns={[column()]} tasks={[]} />)
    const meta = screen.getByTestId('column-meta-col-1')
    expect(within(meta).queryByRole('checkbox')).toBeNull()
    expect(meta.firstElementChild?.contains(within(meta).getByTestId('column-description'))).toBe(true)
  })

  it('sem descrição: nenhuma faixa de descrição', () => {
    render(<Column columns={[column({ description: null })]} tasks={[task(1)]} />)
    expect(within(screen.getByTestId('column-meta-col-1')).queryByTestId('column-description')).toBeNull()
  })
})

describe('cards virtualizados', () => {
  it('a altura medida fica presa ao id do card, não à posição (reordenar não sobrepõe cards)', () => {
    const tasks = Array.from({ length: 60 }, (_, index) => task(index + 1))
    const { rerender } = render(<Column columns={[column()]} tasks={tasks} />)
    expect(virtual.getItemKey?.(0)).toBe(tasks[0]!.id)
    const reordered = [...tasks].reverse()
    rerender(<Column columns={[column()]} tasks={reordered} />)
    expect(virtual.getItemKey?.(0)).toBe(tasks[59]!.id)
    expect(virtual.getItemKey?.(59)).toBe(tasks[0]!.id)
  })
})
