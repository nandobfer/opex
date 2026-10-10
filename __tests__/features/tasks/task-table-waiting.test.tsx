/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDto } from '@/features/tasks/types'

const mocks = vi.hoisted(() => ({ progress: undefined as undefined | (() => { running: boolean; runState: string; waitingFor: string | null; centralId: string }) }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/agentic/components/WorkbenchProgressProvider', () => ({
  useWorkbenchProgress: () => (mocks.progress ? { items: [], progressOf: mocks.progress } : null),
}))

import { TaskTable } from '@/features/tasks/components/TaskTable'
import { useTaskSelection } from '@/features/tasks/hooks/useTaskSelection'
import { buildBoardColumns } from '@/features/tasks/board'

const board = {
  columns: [{ key: 'todo', name: 'A Fazer', color: 'zinc' as const, icon: 'inbox' as const, description: null, wipLimit: null }],
  layout: ['todo'],
}

const TASK = 'a'.repeat(24)
const task = (): TaskDto => ({
  id: TASK,
  code: 'OPX-1',
  columnId: 'todo',
  order: 0,
  title: 'Tarefa',
  summary: null,
  taskType: 'feature',
  priority: 'high',
  archived: false,
  project: { id: 'p1', name: 'CRM', repo: 'o/crm', sigla: 'CRM' },
  createdAt: null,
  updatedAt: null,
})

function Table({ onOpen = vi.fn() }: { onOpen?: () => void }) {
  const tasks = [task()]
  const selection = useTaskSelection(tasks.map((t) => t.id))
  return <TaskTable tasks={tasks} columns={buildBoardColumns(board)} sort={{ column: 'code', direction: 'asc' }} onSortChange={vi.fn()} movingId={null} updatingId={null} selection={selection} onMove={vi.fn()} onUpdate={vi.fn()} onOpen={onOpen} />
}

const waitingLink = () => screen.queryByRole('link', { name: 'Abrir a mesa de OPX-1 — Aguardando revisão do plano' })

beforeEach(() => {
  mocks.progress = undefined
})

describe('TaskTable: linha aguardando ação', () => {
  it('mostra o motivo como link para a mesa', () => {
    mocks.progress = () => ({ running: false, runState: 'idle', waitingFor: 'Aguardando revisão do plano', centralId: 'c1' })
    render(<Table />)
    expect(waitingLink()!.getAttribute('href')).toBe(`/desenvolvimento/c1/${TASK}`)
  })

  it('clicar no motivo abre a mesa e não a tarefa', () => {
    mocks.progress = () => ({ running: false, runState: 'idle', waitingFor: 'Aguardando revisão do plano', centralId: 'c1' })
    const onOpen = vi.fn()
    render(<Table onOpen={onOpen} />)
    fireEvent.click(waitingLink()!)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('sem mesa aguardando, não há link e a linha abre a tarefa', () => {
    const onOpen = vi.fn()
    render(<Table onOpen={onOpen} />)
    expect(waitingLink()).toBeNull()
    fireEvent.click(screen.getByRole('row', { name: 'Abrir OPX-1' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
