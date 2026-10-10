/** @vitest-environment jsdom */

import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TaskDetailDto } from '@/features/tasks/types'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div> }))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useAddComment: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

import { TaskDetailTabs, type TaskDetailTabId } from '@/features/tasks/components/detail/TaskDetailTabs'

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

/** Como a página usa as abas: controladas pelo pai, para preservar a aba ao alternar edição/visão. */
function Harness({ task: value }: { task: TaskDetailDto }) {
  const [tab, setTab] = useState<TaskDetailTabId>('description')
  return <TaskDetailTabs task={value} value={tab} onValueChange={setTab} />
}

describe('TaskDetailTabs', () => {
  it('abre na descrição e lista as seções (descrição, especificação, comentários, histórico, horas)', () => {
    render(<Harness task={task({ description: 'Corpo' })} />)
    const tabs = screen.getAllByRole('tab').map((el) => el.textContent)
    expect(tabs).toEqual(['Descrição', 'Especificação técnica', 'Comentários', 'Histórico', 'Horas'])
    expect(screen.getByTestId('markdown').textContent).toBe('Corpo')
  })

  it('a lista de abas rola na horizontal sem criar barra de scroll vertical', () => {
    render(<Harness task={task({ description: 'Corpo' })} />)
    const list = screen.getByRole('tablist', { name: 'Seções da tarefa' })
    expect(list.className).toContain('overflow-x-auto')
    expect(list.className).toContain('overflow-y-hidden')
    expect(list.className).not.toMatch(/overflow-y-auto/)
  })

  it('ao abrir Comentários renderiza o formulário sem estourar o número de hooks (regressão React #310)', () => {
    const commented = task({ description: 'Corpo', comments: [{ id: 'c1', content: 'Primeiro comentário', createdAt: null }] })
    render(<Harness task={commented} />)
    fireEvent.click(screen.getByRole('tab', { name: /Comentários/ }))
    expect(screen.getByLabelText('Novo comentário')).toBeTruthy()
    expect(screen.getByTestId('markdown').textContent).toBe('Primeiro comentário')
  })

  it('a especificação técnica tem aba própria', () => {
    render(<Harness task={task({ technicalSpec: 'Detalhes técnicos' })} />)
    fireEvent.click(screen.getByRole('tab', { name: /Especificação técnica/ }))
    expect(screen.getByTestId('markdown').textContent).toBe('Detalhes técnicos')
  })
})
