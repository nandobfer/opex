/** @vitest-environment jsdom */

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import type { TaskDto } from '@/features/tasks/types'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

import { TooltipProvider } from '@/components/ui/tooltip'
import { TaskColumn, columnSortableId } from '@/features/tasks/components/TaskColumn'
import { buildBoardColumns, type CustomColumnDto } from '@/features/tasks/board'
import { useTaskSelection } from '@/features/tasks/hooks/useTaskSelection'

const task = (n: number): TaskDto => ({
  id: String(n).padStart(24, '0'),
  code: `GO-DEV-${n}`,
  title: `Tarefa ${n}`,
  status: 'development',
  order: n,
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
})

const custom = (overrides: Partial<CustomColumnDto> = {}): CustomColumnDto => ({
  key: 'custom-abc',
  name: 'Revisar',
  color: 'violet',
  icon: 'list',
  description: 'Tarefas que preciso revisar antes de mandar para validação no Go! Sipal',
  wipLimit: null,
  ...overrides,
})

function Column({ columnKey, columns, tasks }: { columnKey: string; columns: CustomColumnDto[]; tasks: TaskDto[] }) {
  const selection = useTaskSelection(tasks.map((t) => t.id))
  const view = buildBoardColumns({ columns, layout: ['development', ...columns.map((c) => c.key)] }).find((c) => c.key === columnKey)!
  return (
    <DndContext>
      <SortableContext items={[columnSortableId(view.key)]}>
        <TooltipProvider>
          <TaskColumn
            column={view}
            tasks={tasks}
            rawCount={tasks.length}
            limited={false}
            blocked={false}
            dragActive={false}
            canShiftLeft={false}
            canShiftRight={false}
            currentUserId={null}
            movingId={null}
            selection={selection}
            draggingIds={new Set()}
            highlightIds={new Set()}
            actions={{ onCreateAfter: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onShift: vi.fn() }}
            onOpen={vi.fn()}
          />
        </TooltipProvider>
      </SortableContext>
    </DndContext>
  )
}

describe('cabeçalho da coluna (2 linhas)', () => {
  it('pessoal: 2ª linha com checkbox → descrição → chip "Pessoal", fundo neutro; sem o ícone ⓘ', () => {
    render(<Column columnKey="custom-abc" columns={[custom()]} tasks={[task(1)]} />)
    const meta = screen.getByTestId('column-meta-custom-abc')
    expect(meta.className).toContain('bg-muted/60')
    const checkbox = within(meta).getByRole('checkbox', { name: 'Selecionar todas de Revisar' })
    const description = within(meta).getByTestId('column-description')
    const chip = within(meta).getByText('Pessoal')
    expect(checkbox.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(description.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(description.className).toContain('truncate')
    expect(description.className).toContain('text-[10px]')
    expect(screen.queryByRole('button', { name: 'Sobre Revisar' })).toBeNull()
    // Nome e contador ficam na 1ª linha, fora da faixa.
    expect(within(meta).queryByText('Revisar')).toBeNull()
  })

  it('descrição: tooltip com o texto inteiro ao passar o mouse', async () => {
    render(<Column columnKey="custom-abc" columns={[custom()]} tasks={[task(1)]} />)
    const description = screen.getByTestId('column-description')
    await act(async () => {
      fireEvent.pointerMove(description)
      fireEvent.focus(description)
    })
    expect((await screen.findByRole('tooltip')).textContent).toBe(custom().description)
  })

  it('Go! Sipal: faixa em destaque (primária), sem descrição, chip à direita', () => {
    render(<Column columnKey="development" columns={[]} tasks={[task(1)]} />)
    const meta = screen.getByTestId('column-meta-development')
    expect(meta.className).toContain('bg-primary/10')
    expect(within(meta).queryByTestId('column-description')).toBeNull()
    expect(within(meta).getByText('Go! Sipal')).toBeTruthy()
    expect(within(meta).getByRole('checkbox', { name: 'Selecionar todas de Desenvolvimento' })).toBeTruthy()
  })

  it('coluna vazia: sem checkbox; descrição começa na esquerda', () => {
    render(<Column columnKey="custom-abc" columns={[custom()]} tasks={[]} />)
    const meta = screen.getByTestId('column-meta-custom-abc')
    expect(within(meta).queryByRole('checkbox')).toBeNull()
    expect(meta.firstElementChild?.contains(within(meta).getByTestId('column-description'))).toBe(true)
  })

  it('pessoal sem descrição: chip continua à direita', () => {
    render(<Column columnKey="custom-abc" columns={[custom({ description: null })]} tasks={[task(1)]} />)
    const meta = screen.getByTestId('column-meta-custom-abc')
    expect(within(meta).queryByTestId('column-description')).toBeNull()
    expect(meta.lastElementChild?.textContent).toBe('Pessoal')
  })
})
