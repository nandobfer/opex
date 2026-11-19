/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardColumnView } from '@/features/tasks/board'
import type { ProjectRef, TaskDetailDto } from '@/features/tasks/types'
import { RepoIndexProvider } from '@/features/github/components/RepoIndexProvider'

/**
 * Tarefa do tipo Plugin (OPE-172): o formulário mostra o escopo (dono ou cliente), exige o cliente no
 * escopo cliente e envia o alvo junto (mesmo schema da API). Outros tipos não têm alvo.
 */

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/github/hooks/useGithub', () => ({ useGithubRepoIndex: () => new Map() }))
vi.mock('@/features/repository-recency/hooks', () => ({ useOwnerRepoRecents: () => ({ recents: [], record: vi.fn() }) }))
vi.mock('@/features/plugins/hooks/usePlugins', () => ({ usePlugins: () => ({ data: [{ id: 'relogio', name: 'Relógio', clientId: null }] }) }))
vi.mock('@/features/orcamentos/hooks/useOrcamentos', () => ({ useOrcamentoClients: () => ({ data: [{ id: 'c'.repeat(24), name: 'ACME' }] }) }))

import { TaskForm } from '@/features/tasks/components/TaskForm'
import { createTaskSchema, pluginTargetIssue } from '@/features/tasks/schemas'

const project: ProjectRef = { id: 'a'.repeat(24), name: 'Portal', repo: 'o/portal', sigla: 'POR' }
const columns: BoardColumnView[] = [{ key: 'todo', label: 'A Fazer', border: 'border-t-zinc-400', dot: 'bg-zinc-400', column: { key: 'todo', name: 'A Fazer', color: 'zinc', icon: 'inbox', description: null, wipLimit: null } }]
const task = (pluginTarget: unknown) =>
  ({ id: 't1', code: 'POR-1', columnId: 'todo', order: 0, title: 'Widget', taskType: 'plugin', pluginTarget, priority: 'low', archived: false, project, createdAt: null, updatedAt: null, description: 'x', technicalSpec: null, comments: [], history: [], timeLogs: [], totalTimeLogged: 0 }) as unknown as TaskDetailDto

const renderForm = (pluginTarget: unknown) => {
  const onSubmit = vi.fn()
  render(
    <RepoIndexProvider enabled>
      <TaskForm mode="edit" task={task(pluginTarget)} projects={[project]} columns={columns} submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    </RepoIndexProvider>,
  )
  const submit = () => fireEvent.submit(screen.getByRole('button', { name: /Salvar/ }).closest('form')!)
  return { onSubmit, submit }
}

beforeEach(() => vi.clearAllMocks())

describe('alvo do plugin no formulário', () => {
  it('no escopo do dono envia o alvo com o plugin escolhido', async () => {
    const { onSubmit, submit } = renderForm({ scope: 'owner', clientId: null, pluginId: 'relogio' })
    expect(screen.getByTestId('task-plugin-target')).toBeTruthy()
    expect(screen.getByText('Relógio')).toBeTruthy()
    submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ taskType: 'plugin', pluginTarget: { scope: 'owner', pluginId: 'relogio' } })
  })

  it('no escopo do cliente sem cliente mostra o erro e não envia', async () => {
    const { onSubmit, submit } = renderForm({ scope: 'client', clientId: null, pluginId: null })
    submit()
    expect(await screen.findByText('Escolha o cliente do plugin')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('schema do alvo', () => {
  it('a API usa a mesma regra do formulário', () => {
    const base = { title: 'T', projectId: 'a'.repeat(24), columnId: 'todo', taskType: 'plugin' }
    expect(createTaskSchema.safeParse({ ...base, pluginTarget: null }).success).toBe(false)
    expect(createTaskSchema.safeParse({ ...base, pluginTarget: { scope: 'client', clientId: 'c'.repeat(24) } }).success).toBe(true)
    expect(createTaskSchema.safeParse({ ...base, taskType: 'feature', pluginTarget: null }).success).toBe(true)
    expect(pluginTargetIssue('plugin', { scope: 'client', clientId: null })).toEqual({ path: 'pluginTarget.clientId', message: 'Escolha o cliente do plugin' })
  })
})
