import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  githubRequest: vi.fn(),
  createTask: vi.fn(),
  assertColumn: vi.fn(),
  createIssueLink: vi.fn(),
  models: {} as Record<string, { docs: unknown[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }>,
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/features/tasks/server/service', () => ({ assertColumn: mocks.assertColumn, createTask: mocks.createTask }))
vi.mock('@/features/github/server/issue-links', () => ({ createIssueLink: mocks.createIssueLink }))
vi.mock('@/features/github/server/mappings', async () => {
  const { DEFAULT_PRIORITY_RULES, DEFAULT_TYPE_RULES } = await import('@/features/github/logic')
  return { getMapping: async () => ({ typeRules: DEFAULT_TYPE_RULES, priorityRules: DEFAULT_PRIORITY_RULES, isDefault: true }) }
})
vi.mock('@/features/github/client', () => {
  class GithubError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message)
      this.name = 'GithubError'
    }
  }
  return { githubRequest: mocks.githubRequest, GithubError }
})
vi.mock('@/lib/db/models/Project', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.project = memoryModel()
  return { Project: mocks.models.project }
})

import { createTaskWithIssue } from '@/features/github/server/task-issue'
import { GithubError } from '@/features/github/client'

const seedProject = async () =>
  (await mocks.models.project.create({ repo: 'o/app', repoUrl: 'https://github.com/o/app', name: 'app', sigla: 'APP', entryColumnKey: 'todo', closedColumnKey: null, enabled: true, taskSeq: 0 }))._id as string

const input = (projectId: string) => ({ title: 'Corrigir login', projectId, columnId: 'todo', description: 'Passos', taskType: 'bugfix', priority: 'high' }) as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.models.project.docs.length = 0
})

describe('criação da tarefa com issue no GitHub', () => {
  it('cria a issue (título, corpo e labels) antes da tarefa e grava o vínculo com a marca d’água', async () => {
    const projectId = await seedProject()
    mocks.githubRequest.mockResolvedValue({ number: 7, html_url: 'https://github.com/o/app/issues/7', state: 'open', updated_at: '2026-10-10T12:00:00Z' })
    mocks.createTask.mockResolvedValue({ id: 't1', code: 'APP-1', title: 'Corrigir login', project: { id: projectId, name: 'app', repo: 'o/app', sigla: 'APP' } })

    const task = await createTaskWithIssue(input(projectId), 'local')

    expect(mocks.assertColumn).toHaveBeenCalledWith('todo')
    expect(mocks.githubRequest).toHaveBeenCalledWith(
      '/repos/o/app/issues',
      expect.objectContaining({ method: 'POST', body: expect.objectContaining({ title: 'Corrigir login', body: 'Passos', labels: ['bug', 'P1'] }) }),
    )
    expect(mocks.createIssueLink).toHaveBeenCalledWith(expect.objectContaining({ repo: 'o/app', number: 7, taskId: 't1', origin: 'opex', issueUpdatedAt: new Date('2026-10-10T12:00:00Z') }))
    expect(task.issue).toMatchObject({ number: 7, repo: 'o/app', state: 'open' })
  })

  it('bloqueia a criação quando o GitHub recusa: nenhuma tarefa é criada', async () => {
    const projectId = await seedProject()
    mocks.githubRequest.mockRejectedValue(new GithubError('Limite de uso da API do GitHub atingido', 'RATE_LIMITED'))

    await expect(createTaskWithIssue(input(projectId), 'local')).rejects.toMatchObject({ status: 429, code: 'GITHUB_RATE_LIMITED' })
    expect(mocks.createTask).not.toHaveBeenCalled()
    expect(mocks.createIssueLink).not.toHaveBeenCalled()
  })

  it('projeto inválido falha antes de chamar o GitHub', async () => {
    await expect(createTaskWithIssue(input('a'.repeat(24)), 'local')).rejects.toMatchObject({ status: 400, code: 'PROJECT_NOT_FOUND' })
    expect(mocks.githubRequest).not.toHaveBeenCalled()
  })
})
