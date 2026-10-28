/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardColumnView } from '@/features/tasks/board'
import type { ProjectRef } from '@/features/tasks/types'

const mocks = vi.hoisted(() => ({
  recents: [] as readonly string[],
  record: vi.fn(),
}))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/repository-recency/hooks', () => ({
  useOwnerRepoRecents: () => ({ recents: mocks.recents, record: mocks.record }),
}))

import { TaskForm } from '@/features/tasks/components/TaskForm'

const id = (letter: string) => letter.repeat(24)

const project = (letter: string, name: string, repo: string): ProjectRef => ({ id: id(letter), name, repo, sigla: name.slice(0, 3).toUpperCase() })

const PROJECTS: ProjectRef[] = [project('a', 'Alpha', 'acme/alpha'), project('b', 'Beta', 'acme/beta'), project('c', 'Gamma', 'acme/gamma')]

const columns: BoardColumnView[] = [
  { key: 'todo', label: 'A Fazer', border: 'border-t-zinc-400', dot: 'bg-zinc-400', column: { key: 'todo', name: 'A Fazer', color: 'zinc', icon: 'inbox', description: null, wipLimit: null } },
]

const repoTrigger = () => document.getElementById('task-repo') as HTMLButtonElement
/** Texto de `owner/repo` de cada opção (o avatar cai na inicial, então lemos o rótulo do repositório). */
const options = () => screen.getAllByRole('option').map((option) => option.querySelector('.truncate')?.textContent ?? '')

const renderForm = (recents: readonly string[]) => {
  mocks.recents = recents
  render(<TaskForm mode="create" projects={PROJECTS} columns={columns} submitting={false} onSubmit={vi.fn()} onCancel={vi.fn()} />)
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('TaskForm: repositórios por uso recente', () => {
  it('abre a busca com os repositórios usados recentemente primeiro', () => {
    renderForm([id('c')])
    fireEvent.click(repoTrigger())
    expect(options()).toEqual(['acme/gamma', 'acme/alpha', 'acme/beta'])
  })

  it('sem histórico, mantém a ordem dos repositórios vinculados', () => {
    renderForm([])
    fireEvent.click(repoTrigger())
    expect(options()).toEqual(['acme/alpha', 'acme/beta', 'acme/gamma'])
  })

  it('registra o repositório escolhido no histórico', () => {
    renderForm([id('c')])
    fireEvent.click(repoTrigger())
    fireEvent.click(screen.getAllByRole('option')[0])
    expect(mocks.record).toHaveBeenCalledWith(id('c'))
  })

  it('não altera o repositório inicial do formulário', () => {
    renderForm([id('c')])
    expect(repoTrigger().textContent).toContain('acme/alpha')
  })
})
