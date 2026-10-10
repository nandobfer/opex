import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  githubRequest: vi.fn(),
  updateTask: vi.fn(),
  moveTask: vi.fn(),
  publish: vi.fn(),
  models: {} as Record<string, { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }>,
}))

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn(),
  recordAudit: vi.fn(),
  AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', MOVER: 'MOVER', EXCLUIR: 'EXCLUIR' },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/tasks/server/service', () => ({ updateTask: mocks.updateTask, moveTask: mocks.moveTask, publishTasksUpdated: mocks.publish }))
vi.mock('@/features/github/client', () => ({ githubRequest: mocks.githubRequest }))
vi.mock('@/features/github/server/mappings', async () => {
  const { DEFAULT_PRIORITY_RULES, DEFAULT_TYPE_RULES } = await import('@/features/github/logic')
  return { getMapping: async () => ({ typeRules: DEFAULT_TYPE_RULES, priorityRules: DEFAULT_PRIORITY_RULES, isDefault: true }) }
})
vi.mock('@/lib/db/models/DevTask', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.devTask = memoryModel()
  return { DevTask: mocks.models.devTask, TaskComment: memoryModel() }
})
vi.mock('@/lib/db/models/Project', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.project = memoryModel()
  return { Project: mocks.models.project }
})
vi.mock('@/lib/db/models/Github', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.link = memoryModel()
  return { GithubIssueLink: mocks.models.link, GithubMapping: memoryModel() }
})

import { pushTaskToIssue, reconcileTaskIssue } from '@/features/github/server/task-sync'
import type { GithubIssueLite } from '@/features/github/logic'
import type { GithubMappingDto } from '@/features/github/types'

const mapping: GithubMappingDto = { typeRules: [], priorityRules: [], isDefault: true }

const OLD = new Date('2026-10-01T10:00:00Z')
const NEW = new Date('2026-10-05T10:00:00Z')

const seed = async (overrides: { task?: Record<string, unknown>; link?: Record<string, unknown>; closedColumnKey?: string | null } = {}) => {
  const project = await mocks.models.project.create({ repo: 'o/app', repoUrl: 'https://github.com/o/app', name: 'app', sigla: 'APP', entryColumnKey: 'todo', closedColumnKey: overrides.closedColumnKey ?? 'done', enabled: true, taskSeq: 0 })
  const task = await mocks.models.devTask.create({ code: 'APP-1', projectId: project._id, columnId: 'doing', order: 0, title: 'Título', description: 'Corpo', technicalSpec: null, taskType: 'bugfix', priority: 'high', archived: false, updatedAt: OLD, ...overrides.task })
  const link = await mocks.models.link.create({ repo: 'o/app', number: 7, url: 'https://github.com/o/app/issues/7', taskId: task._id, taskCode: 'APP-1', issueState: 'open', issueStateReason: null, notice: null, issueUpdatedAt: OLD, lastOrigin: 'opex', ...overrides.link })
  return { project, task, link }
}

const issue = (overrides: Partial<GithubIssueLite> = {}): GithubIssueLite => ({
  number: 7,
  title: 'Título',
  body: 'Corpo',
  htmlUrl: 'https://github.com/o/app/issues/7',
  state: 'open',
  stateReason: null,
  labels: [],
  type: null,
  milestone: null,
  assignees: [],
  author: { login: 'ana', avatarUrl: null },
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: NEW.toISOString(),
  isPullRequest: false,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  for (const model of Object.values(mocks.models)) model.docs.length = 0
})

describe('pushTaskToIssue (tarefa → issue)', () => {
  it('envia título, descrição, labels (tipo/prioridade) e estado aberto; grava a marca d’água', async () => {
    const { task, link } = await seed()
    mocks.githubRequest.mockResolvedValue({ number: 7, html_url: 'https://github.com/o/app/issues/7', state: 'open', updated_at: NEW.toISOString() })

    const result = await pushTaskToIssue(task._id)

    expect(result.pushed).toBe(true)
    expect(mocks.githubRequest).toHaveBeenCalledWith(
      '/repos/o/app/issues/7',
      expect.objectContaining({ method: 'PATCH', body: expect.objectContaining({ title: 'Título', body: 'Corpo', labels: ['bug', 'P1'], state: 'open' }) }),
    )
    const saved = mocks.models.link.docs.find((doc) => doc._id === link._id)!
    expect(saved.lastOrigin).toBe('opex')
    expect((saved.issueUpdatedAt as Date).toISOString()).toBe(NEW.toISOString())
  })

  it('fecha a issue quando a tarefa está na coluna de conclusão', async () => {
    const { task } = await seed({ task: { columnId: 'done' } })
    mocks.githubRequest.mockResolvedValue({ number: 7, html_url: 'x', state: 'closed', state_reason: 'completed', updated_at: NEW.toISOString() })

    await pushTaskToIssue(task._id)

    expect(mocks.githubRequest).toHaveBeenCalledWith('/repos/o/app/issues/7', expect.objectContaining({ body: expect.objectContaining({ state: 'closed' }) }))
  })

  it('sem vínculo, não chama o GitHub', async () => {
    expect((await pushTaskToIssue('a'.repeat(24))).pushed).toBe(false)
    expect(mocks.githubRequest).not.toHaveBeenCalled()
  })
})

describe('reconcileTaskIssue (last-write-wins)', () => {
  it('issue mais recente → aplica na tarefa (com origem GitHub) e move a coluna pelo estado', async () => {
    const { task, link } = await seed({ task: { updatedAt: OLD } })
    mocks.models.devTask.docs.find((doc) => doc._id === task._id)!.updatedAt = OLD

    const status = await reconcileTaskIssue({ closedColumnKey: 'done', entryColumnKey: 'todo' } as never, issue({ state: 'closed' }), link as never, mapping)

    expect(status).toBe('applied')
    expect(mocks.updateTask).toHaveBeenCalledWith(task._id, expect.objectContaining({ title: 'Título', description: 'Corpo' }), 'system', { origin: 'github', publish: false })
    expect(mocks.moveTask).toHaveBeenCalledWith(task._id, { targetColumn: 'done' }, 'system', { origin: 'github', publish: false })
    expect(mocks.githubRequest).not.toHaveBeenCalled()
  })

  it('tarefa mais recente que a issue → empurra para a issue', async () => {
    const MID = new Date('2026-10-03T10:00:00Z')
    const { task, link } = await seed({ task: { updatedAt: NEW }, link: { issueUpdatedAt: OLD } })
    mocks.githubRequest.mockResolvedValue({ number: 7, html_url: 'x', state: 'open', updated_at: new Date().toISOString() })

    const status = await reconcileTaskIssue({ closedColumnKey: 'done', entryColumnKey: 'todo' } as never, issue({ updatedAt: MID.toISOString() }), link as never, mapping)

    expect(status).toBe('pushed')
    expect(mocks.githubRequest).toHaveBeenCalledWith('/repos/o/app/issues/7', expect.objectContaining({ method: 'PATCH' }))
    expect(mocks.updateTask).not.toHaveBeenCalled()
    expect(task._id).toBeTruthy()
  })

  it('sem mudança na issue desde a marca d’água, não faz nada', async () => {
    const { link } = await seed({ link: { issueUpdatedAt: NEW } })
    const status = await reconcileTaskIssue({ closedColumnKey: 'done', entryColumnKey: 'todo' } as never, issue({ updatedAt: NEW.toISOString() }), link as never, mapping)
    expect(status).toBe('none')
    expect(mocks.updateTask).not.toHaveBeenCalled()
    expect(mocks.githubRequest).not.toHaveBeenCalled()
  })
})
