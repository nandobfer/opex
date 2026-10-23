/** @vitest-environment jsdom */

import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDetailDto } from '@/features/tasks/types'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useAddComment: () => ({ mutateAsync: vi.fn(), mutate: mocks.mutate, isPending: false }) }))
vi.mock('@/features/tasks/attachments/hooks', () => ({
  useOwnerAttachmentClient: () => ({}),
  useTaskDescriptionUploads: () => ({ media: { enqueue: vi.fn(), items: [], retry: vi.fn(), cancel: vi.fn(), dismiss: vi.fn() }, active: 0 }),
}))

import { TaskDetailTabs, type TaskDetailTabId } from '@/features/tasks/components/detail/TaskDetailTabs'
import { TaskLineCommentsProvider } from '@/features/tasks/components/detail/line-comments/LineCommentsContext'
import { lineHash } from '@/lib/markdown/lines'

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

/** Página do dono: abas dentro do provider dos comentários de linha (ir para a linha troca a aba). */
function LineHarness({ task: value }: { task: TaskDetailDto }) {
  const [tab, setTab] = useState<TaskDetailTabId>('description')
  return (
    <TaskLineCommentsProvider task={value} onTab={setTab}>
      <TaskDetailTabs task={value} value={tab} onValueChange={setTab} />
    </TaskLineCommentsProvider>
  )
}

describe('TaskDetailTabs — comentários de linha', () => {
  const lineComment = {
    id: 'c2',
    content: '> 💬 Linha 3 da **Descrição**:\n> Linha dois\n\nRevisar isto',
    body: 'Revisar isto',
    lineRef: { field: 'description' as const, commentId: null, line: 3, hash: lineHash('Linha dois'), quote: 'Linha dois' },
    authorType: 'owner' as const,
    authorName: 'Dono',
    createdAt: '2026-10-09T12:00:00Z',
  }
  const withLine = task({ description: 'Linha um\n\nLinha dois', comments: [{ id: 'c1', content: 'Primeiro', body: 'Primeiro', lineRef: null, authorType: 'owner', authorName: 'Dono', createdAt: null }, lineComment] })

  beforeEach(() => mocks.mutate.mockClear())

  it('a linha comentada mostra o badge; o popover lista a conversa e comenta com a referência da linha', async () => {
    render(<LineHarness task={withLine} />)
    expect(screen.getAllByRole('button', { name: 'Comentar a linha' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Comentar a linha (1)' }))
    expect(await screen.findByText('Revisar isto')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Comentário na linha 3' }), { target: { value: 'Concordo' } })
    fireEvent.click(screen.getByRole('button', { name: /^Comentar$/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ content: 'Concordo', lineRef: { field: 'description', commentId: null, line: 3, text: 'Linha dois' } })
  })

  it('na aba Comentários, a citação leva de volta à linha na Descrição', async () => {
    render(<LineHarness task={withLine} />)
    fireEvent.click(screen.getByRole('tab', { name: /Comentários/ }))
    expect(screen.getByText('Linha 3 da Descrição')).toBeTruthy()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    fireEvent.click(screen.getByRole('button', { name: /Ir para a linha/ }))
    await waitFor(() => expect(screen.getByRole('tab', { name: /Descrição/ }).getAttribute('aria-selected')).toBe('true'))
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    expect((scrollIntoView.mock.contexts[0] as HTMLElement).getAttribute('data-md-anchor')).toBe('description:3')
  })

  it('linha removida: o comentário fica órfão, sem "Ir para a linha"', () => {
    render(<LineHarness task={task({ description: 'Outro texto completamente diferente', comments: [lineComment] })} />)
    fireEvent.click(screen.getByRole('tab', { name: /Comentários/ }))
    expect(screen.getByText(/Linha não encontrada/)).toBeTruthy()
    expect((screen.getByRole('button', { name: /Ir para a linha/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('fora da página do dono (sem provider) não há botão de comentar linha', () => {
    render(<Harness task={withLine} />)
    expect(screen.queryByRole('button', { name: /Comentar a linha/ })).toBeNull()
  })
})
