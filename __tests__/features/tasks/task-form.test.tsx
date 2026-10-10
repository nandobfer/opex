/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardColumnView } from '@/features/tasks/board'
import type { ProjectRef } from '@/features/tasks/types'

import { RepoIndexProvider } from '@/features/github/components/RepoIndexProvider'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/github/hooks/useGithub', () => ({
  useGithubRepoIndex: () => new Map([['o/portal', { fullName: 'o/portal', htmlUrl: 'https://github.com/o/portal', description: 'Portal interno', private: false, ownerAvatarUrl: 'https://avatars.githubusercontent.com/u/9?v=4' }]]),
}))

import { TaskForm } from '@/features/tasks/components/TaskForm'

const project: ProjectRef = { id: 'a'.repeat(24), name: 'Portal', repo: 'o/portal', sigla: 'POR' }
const columns: BoardColumnView[] = [
  { key: 'todo', label: 'A Fazer', border: 'border-t-zinc-400', dot: 'bg-zinc-400', column: { key: 'todo', name: 'A Fazer', color: 'zinc', icon: 'inbox', description: null, wipLimit: null } },
]

const renderForm = (overrides: Partial<React.ComponentProps<typeof TaskForm>> = {}) => {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  render(
    <RepoIndexProvider enabled>
      <TaskForm mode="create" projects={[project]} columns={columns} submitting={false} onSubmit={onSubmit} onCancel={onCancel} {...overrides} />
    </RepoIndexProvider>,
  )
  return { onSubmit, onCancel }
}

beforeEach(() => vi.clearAllMocks())

describe('TaskForm', () => {
  it('mostra o título, as abas de Markdown e o repositório vinculado', () => {
    renderForm()
    expect(screen.getByLabelText('Título')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Escrever/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Visualizar/ })).toBeTruthy()
    expect(screen.getByText('o/portal')).toBeTruthy()
    expect(document.querySelector('img[src="https://avatars.githubusercontent.com/u/9?v=4"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Criar tarefa' })).toBeTruthy()
  })

  it('envia os valores com o projeto e a coluna padrão', async () => {
    const { onSubmit } = renderForm()
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Nova tarefa' } })
    const form = screen.getByRole('button', { name: 'Criar tarefa' }).closest('form')
    expect(form).toBeTruthy()
    fireEvent.submit(form!)
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Nova tarefa', projectId: 'a'.repeat(24), columnId: 'todo', priority: 'medium' })
  })

  it('pré-visualiza a descrição em Markdown', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: '**negrito**' } })
    fireEvent.click(screen.getByRole('tab', { name: /Visualizar/ }))
    expect(screen.getByText('negrito')).toBeTruthy()
  })

  it('em edição o repositório é somente leitura', () => {
    renderForm({ mode: 'edit', task: { id: 't1', code: 'POR-1', columnId: 'todo', order: 0, title: 'Existente', taskType: null, priority: 'low', archived: false, project, createdAt: null, updatedAt: null, description: 'x', technicalSpec: null, comments: [], history: [], timeLogs: [], totalTimeLogged: 0 } })
    expect(screen.getByLabelText('Repositório').hasAttribute('disabled')).toBe(true)
  })
})
