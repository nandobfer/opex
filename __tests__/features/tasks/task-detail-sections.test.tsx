/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TaskDetailDto } from '@/features/tasks/types'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div> }))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useAddComment: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

import { DescriptionSection } from '@/features/tasks/components/detail/TaskDetailSections'

const task = (overrides: Partial<TaskDetailDto> = {}): TaskDetailDto => ({
  id: 'a'.repeat(24),
  code: 'OPX-1',
  columnId: 'todo',
  order: 0,
  title: 'Tarefa',
  summary: null,
  taskType: 'feature',
  priority: 'medium',
  archived: false,
  project: null,
  createdAt: null,
  updatedAt: null,
  description: null,
  technicalSpec: null,
  comments: [],
  history: [],
  timeLogs: [],
  totalTimeLogged: 0,
  ...overrides,
})

describe('DescriptionSection: a descrição nunca é substituída pelo resumo', () => {
  it('com resumo presente, ainda mostra a descrição completa (e não o resumo)', () => {
    render(<DescriptionSection task={task({ description: 'Corpo completo da tarefa', summary: 'Resumo curto de uma linha' })} />)
    expect(screen.getByText('Descrição')).toBeTruthy()
    expect(screen.getByTestId('markdown').textContent).toBe('Corpo completo da tarefa')
    expect(screen.queryByText('Resumo curto de uma linha')).toBeNull()
  })

  it('mostra descrição e especificação técnica juntas', () => {
    render(<DescriptionSection task={task({ description: 'Corpo', technicalSpec: 'Spec técnica' })} />)
    expect(screen.getByText('Descrição')).toBeTruthy()
    expect(screen.getByText('Especificação técnica')).toBeTruthy()
    expect(screen.getAllByTestId('markdown').map((el) => el.textContent)).toEqual(['Corpo', 'Spec técnica'])
  })

  it('sem descrição nem especificação, mostra o vazio mesmo havendo resumo', () => {
    render(<DescriptionSection task={task({ description: null, technicalSpec: null, summary: 'Resumo curto' })} />)
    expect(screen.getByText('Sem descrição.')).toBeTruthy()
  })
})
