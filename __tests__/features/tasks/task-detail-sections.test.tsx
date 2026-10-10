/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TaskDetailDto } from '@/features/tasks/types'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div> }))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useAddComment: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

import { DescriptionSection, TechnicalSpecSection } from '@/features/tasks/components/detail/TaskDetailSections'

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

describe('DescriptionSection: descrição sem título próprio e nunca substituída pelo resumo', () => {
  it('mostra a descrição completa (e não o resumo), sem o título "Descrição"', () => {
    render(<DescriptionSection task={task({ description: 'Corpo completo da tarefa', summary: 'Resumo curto de uma linha' })} />)
    expect(screen.getByTestId('markdown').textContent).toBe('Corpo completo da tarefa')
    expect(screen.queryByText('Descrição')).toBeNull()
    expect(screen.queryByText('Resumo curto de uma linha')).toBeNull()
  })

  it('sem descrição, mostra o vazio mesmo havendo resumo', () => {
    render(<DescriptionSection task={task({ description: null, summary: 'Resumo curto' })} />)
    expect(screen.getByText('Sem descrição.')).toBeTruthy()
  })
})

describe('TechnicalSpecSection: a especificação técnica tem aba própria', () => {
  it('mostra a especificação técnica', () => {
    render(<TechnicalSpecSection task={task({ technicalSpec: 'Spec técnica' })} />)
    expect(screen.getByTestId('markdown').textContent).toBe('Spec técnica')
  })

  it('sem especificação, mostra o vazio', () => {
    render(<TechnicalSpecSection task={task({ technicalSpec: null })} />)
    expect(screen.getByText('Sem especificação técnica.')).toBeTruthy()
  })
})
