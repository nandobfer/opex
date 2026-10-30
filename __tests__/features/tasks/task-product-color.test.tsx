/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { CentralDto } from '@/features/agentic/types'
import type { TaskDto } from '@/features/tasks/types'

/** Repositório na cor da central em /tarefas: kanban, tabela e card compacto (OPE-100, port do MT-33). */

const mocks = vi.hoisted(() => ({ centrals: [] as unknown[] }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/agentic/hooks/useAgentic', () => ({
  useCentrals: () => ({ data: mocks.centrals }),
  useCentralsRealtime: () => undefined,
}))

import { CentralColorsProvider } from '@/features/agentic/components/CentralColorsProvider'
import { TaskCardView } from '@/features/tasks/components/TaskCard'
import { TaskTable } from '@/features/tasks/components/TaskTable'
import { TaskCompactCard } from '@/features/tasks/components/TaskCompactCard'
import { useTaskSelection } from '@/features/tasks/hooks/useTaskSelection'
import { buildBoardColumns } from '@/features/tasks/board'

const board = { columns: [{ key: 'todo', name: 'A Fazer', color: 'zinc' as const, icon: 'inbox' as const, description: null, wipLimit: null }], layout: ['todo'] }

const task = (overrides: Partial<TaskDto> = {}): TaskDto => ({
  id: 'a'.repeat(24),
  code: 'OPX-1',
  columnId: 'todo',
  order: 0,
  title: 'Tarefa',
  summary: null,
  taskType: 'feature',
  priority: 'high',
  archived: false,
  project: { id: 'p1', name: 'Opex', repo: 'nandobfer/opex', sigla: 'OPX' },
  createdAt: null,
  updatedAt: null,
  ...overrides,
})

const central = (projectId: string, color: string | null) => ({ id: `c-${projectId}`, projectId, projectName: 'Opex', config: { color } }) as unknown as CentralDto

function Table({ tasks }: { tasks: TaskDto[] }) {
  const selection = useTaskSelection(tasks.map((t) => t.id))
  return <TaskTable tasks={tasks} columns={buildBoardColumns(board)} sort={{ column: 'code', direction: 'asc' }} onSortChange={vi.fn()} movingId={null} updatingId={null} selection={selection} onMove={vi.fn()} onUpdate={vi.fn()} onOpen={vi.fn()} />
}

function Compact({ item }: { item: TaskDto }) {
  const selection = useTaskSelection([item.id])
  return <TaskCompactCard task={item} columns={buildBoardColumns(board)} moving={false} updating={false} ordered={[item.id]} selection={selection} onMove={vi.fn()} onUpdate={vi.fn()} onOpen={vi.fn()} />
}

const withColors = (ui: React.ReactNode) => render(<CentralColorsProvider>{ui}</CentralColorsProvider>)
const repoName = () => screen.getByTestId('github-repo-name')

beforeEach(() => {
  mocks.centrals = [central('p1', 'rose')]
})
afterEach(() => cleanup())

describe('repositório na cor da central em Tarefas', () => {
  it('card do kanban pinta o org/repo com a cor da central do projeto', () => {
    withColors(<TaskCardView task={task()} />)
    expect(repoName().textContent).toBe('nandobfer/opex')
    expect(repoName().classList.contains('text-rose-400')).toBe(true)
  })

  it('tabela pinta o org/repo da coluna Repositório', () => {
    withColors(<Table tasks={[task()]} />)
    expect(repoName().classList.contains('text-rose-400')).toBe(true)
  })

  it('card compacto (celular) pinta o org/repo', () => {
    withColors(<Compact item={task()} />)
    expect(repoName().classList.contains('text-rose-400')).toBe(true)
  })

  it('central sem cor, projeto sem central ou fora do provider: o rótulo fica no padrão (sem cor)', () => {
    mocks.centrals = [central('p1', null)]
    const { unmount } = withColors(<TaskCardView task={task()} />)
    expect(Array.from(repoName().classList).some((name) => /^text-\w+-400$/.test(name))).toBe(false)
    unmount()
    mocks.centrals = [central('p2', 'rose')]
    const second = withColors(<TaskCardView task={task()} />)
    expect(repoName().classList.contains('text-rose-400')).toBe(false)
    second.unmount()
    render(<TaskCardView task={task()} />)
    expect(repoName().classList.contains('text-rose-400')).toBe(false)
  })
})
