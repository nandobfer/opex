/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TaskDto } from '@/features/tasks/types'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

import { TaskBoard } from '@/features/tasks/components/TaskBoard'
import { buildBoardColumns } from '@/features/tasks/board'
import { useTaskSelection } from '@/features/tasks/hooks/useTaskSelection'
import { CONTENT_BLEED_X, CONTENT_PADDING_X } from '@/features/layout/content-padding'
import { BULK_BAR_CLEARANCE, BULK_BAR_CLEARANCE_PX } from '@/features/tasks/components/TaskBulkBar'

const board = {
  columns: [
    { key: 'todo', name: 'A Fazer', color: 'zinc' as const, icon: 'inbox' as const, description: null, wipLimit: null },
    { key: 'doing', name: 'Em Andamento', color: 'sky' as const, icon: 'clock' as const, description: null, wipLimit: null },
  ],
  layout: ['todo', 'doing'],
}
const columns = buildBoardColumns(board)

const task = (n: number): TaskDto => ({
  id: String(n).padStart(24, '0'),
  code: `OPX-${n}`,
  columnId: 'todo',
  order: n,
  title: `Tarefa ${n}`,
  taskType: 'feature',
  priority: 'medium',
  archived: false,
  project: null,
  createdAt: null,
  updatedAt: null,
})

function Board({ tasks }: { tasks: TaskDto[] }) {
  const selection = useTaskSelection(tasks.map((t) => t.id))
  return (
    <TaskBoard
      tasks={tasks}
      columns={columns}
      rawCounts={{ todo: tasks.length }}
      sort="priority"
      movingId={null}
      selection={selection}
      actions={{ onCreateAfter: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onShift: vi.fn() }}
      onMove={vi.fn()}
      onMoveMany={vi.fn()}
      onReorderColumns={vi.fn()}
      onOpen={vi.fn()}
    />
  )
}

const classes = (value: string) => value.split(/\s+/).filter(Boolean)

describe('kanban: altura e largura', () => {
  it('a lista de cards ocupa o resto da coluna (sem altura máxima chutada) e rola até o fim dela', () => {
    render(<Board tasks={[task(1), task(2)]} />)
    const list = screen.getByTestId('column-cards-todo')
    expect(list.className).not.toMatch(/max-h/)
    expect(classes(list.className)).toEqual(expect.arrayContaining(['flex-1', 'basis-0', 'min-h-0', 'overflow-y-auto']))
  })

  it('o quadro ocupa a altura da página e sangra até a borda do conteúdo (mesmo espaçamento do layout)', () => {
    render(<Board tasks={[task(1)]} />)
    const board = screen.getByTestId('task-board')
    expect(classes(board.className)).toEqual(expect.arrayContaining(['flex-1', 'min-h-0', 'overflow-x-auto', ...classes(CONTENT_BLEED_X)]))
  })

  it('a sangria é exatamente o espaçamento do layout, negativo', () => {
    const padding = classes(CONTENT_PADDING_X)
    const bleed = classes(CONTENT_BLEED_X)
    for (const cls of padding) {
      expect(bleed).toContain(cls)
      expect(bleed).toContain(cls.replace(/(^|:)px-/, '$1-mx-'))
    }
    expect(bleed).toHaveLength(padding.length * 2)
  })

  it('o AppShell usa a constante de espaçamento (os dois não divergem)', () => {
    const shell = readFileSync(join(process.cwd(), 'src/features/layout/components/AppShell.tsx'), 'utf8')
    expect(shell).toContain('CONTENT_PADDING_X')
    expect(shell).not.toMatch(/px-4 py-6 md:px-6 lg:px-8/)
  })

  it('seleção: o quadro mantém a altura; cada coluna ganha espaço no fim da lista para a barra flutuante', async () => {
    render(<Board tasks={[task(1), task(2)]} />)
    const board = screen.getByTestId('task-board')
    const before = board.className
    expect(screen.queryByTestId('bulk-bar-clearance')).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar OPX-1' })))
    expect(board.className).toBe(before)
    const spacer = screen.getByTestId('bulk-bar-clearance')
    expect(screen.getByTestId('column-cards-todo').contains(spacer)).toBe(true)
  })

  it('a página não reserva espaço para a barra (encolheria o quadro); tabela usa a mesma constante', () => {
    const page = readFileSync(join(process.cwd(), 'src/features/tasks/components/TasksPage.tsx'), 'utf8')
    expect(page).not.toMatch(/hasSelection && "pb-24"/)
    const table = readFileSync(join(process.cwd(), 'src/features/tasks/components/TaskTable.tsx'), 'utf8')
    expect(table).toContain('hasSelection && BULK_BAR_CLEARANCE')
    expect(BULK_BAR_CLEARANCE).toBe('pb-24')
    expect(BULK_BAR_CLEARANCE_PX).toBe(24 * 4)
  })
})
