/** @vitest-environment happy-dom */

import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TaskDetailDto } from '@/features/tasks/types'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div> }))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useAddComment: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/features/tasks/attachments/hooks', () => ({
  useOwnerAttachmentClient: () => ({}),
  useTaskDescriptionUploads: () => ({ media: { enqueue: vi.fn(), items: [], retry: vi.fn(), cancel: vi.fn(), dismiss: vi.fn() }, active: 0 }),
}))

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
  attachmentsCount: 0,
  ...overrides,
})

/** Como a página usa as abas: controladas pelo pai, para preservar a aba ao alternar edição/visão. */
function Harness({ task: value }: { task: TaskDetailDto }) {
  const [tab, setTab] = useState<TaskDetailTabId>('description')
  return <TaskDetailTabs task={value} value={tab} onValueChange={setTab} />
}

describe('TaskDetailTabs', () => {
  it('abre na descrição e lista as seções (descrição, especificação, anexos, comentários, histórico, horas)', () => {
    render(<Harness task={task({ description: 'Corpo' })} />)
    const tabs = screen.getAllByRole('tab').map((el) => el.textContent)
    expect(tabs).toEqual(['Descrição', 'Especificação técnica', 'Anexos', 'Comentários', 'Histórico', 'Horas'])
    expect(screen.getByTestId('markdown').textContent).toBe('Corpo')
  })

  it('mostra o contador de anexos na aba', () => {
    render(<Harness task={task({ description: 'Corpo', attachmentsCount: 3 })} />)
    const tab = screen.getByRole('tab', { name: /Anexos/ })
    expect(tab.textContent).toBe('Anexos3')
  })

  it('a lista de abas rola na horizontal sem criar barra de scroll vertical', () => {
    render(<Harness task={task({ description: 'Corpo' })} />)
    const list = screen.getByRole('tablist', { name: 'Seções da tarefa' })
    expect(list.className).toContain('overflow-x-auto')
    expect(list.className).toContain('overflow-y-hidden')
    expect(list.className).not.toMatch(/overflow-y-auto/)
  })

  it('ao abrir Comentários renderiza o formulário sem estourar o número de hooks (regressão React #310)', () => {
    const commented = task({ description: 'Corpo', comments: [{ id: 'c1', content: 'Primeiro comentário', body: 'Primeiro comentário', lineRef: null, authorType: 'owner', authorName: 'Dono', createdAt: null }] })
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

  it('renderiza o slot do refinamento abaixo da especificação na aba ativa', () => {
    render(<TaskDetailTabs task={task({ technicalSpec: 'Detalhes técnicos' })} value="spec" onValueChange={vi.fn()} specSlot={<div data-testid="spec-slot">Painel do refinamento</div>} />)
    const panel = screen.getByTestId('spec-slot').parentElement
    const content = panel?.textContent ?? ''
    expect(content).toContain('Painel do refinamento')
    expect(content.indexOf('Detalhes técnicos')).toBeLessThan(content.indexOf('Painel do refinamento'))
  })

  it('não renderiza o slot do refinamento fora da aba de especificação', () => {
    render(<TaskDetailTabs task={task({ description: 'Corpo' })} value="description" onValueChange={vi.fn()} specSlot={<div data-testid="spec-slot" />} />)
    expect(screen.queryByTestId('spec-slot')).toBeNull()
  })
})
