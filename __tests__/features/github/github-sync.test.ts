import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findIssueLink: vi.fn(),
  createIssueLink: vi.fn(),
  updateIssueState: vi.fn(),
  createTaskFromIssue: vi.fn(),
  reconcileTaskIssue: vi.fn(),
  publishGithubUpdated: vi.fn(),
  models: {} as Record<string, { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }>,
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: vi.fn() }))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => ({ request: vi.fn(), response: vi.fn(), error: vi.fn(), warn: vi.fn() }) }))
vi.mock('@/features/github/client', () => ({ githubPaginate: vi.fn(), githubRequestFull: vi.fn() }))
vi.mock('@/features/tasks/server/service', () => ({ createTaskFromIssue: mocks.createTaskFromIssue }))
vi.mock('@/features/github/server/issue-links', () => ({ findIssueLink: mocks.findIssueLink, createIssueLink: mocks.createIssueLink, updateIssueState: mocks.updateIssueState }))
vi.mock('@/features/github/server/mappings', () => ({ getMapping: vi.fn() }))
vi.mock('@/features/github/server/task-sync', () => ({ reconcileTaskIssue: mocks.reconcileTaskIssue }))
vi.mock('@/features/github/server/events', () => ({ publishGithubUpdated: mocks.publishGithubUpdated }))
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
vi.mock('@/lib/db/models/TaskBoard', async () => ({ TaskBoardColumn: memoryModelStub(), TaskBoardLayout: memoryModelStub() }))

function memoryModelStub() {
  return { find: () => ({ select: () => ({ lean: async () => [] }) }) }
}

import { processIssue } from '@/features/github/server/sync'
import { DEFAULT_PRIORITY_RULES, DEFAULT_TYPE_RULES, type GithubIssueLite } from '@/features/github/logic'
import type { GithubMappingDto } from '@/features/github/types'

const mapping: GithubMappingDto = { typeRules: DEFAULT_TYPE_RULES, priorityRules: DEFAULT_PRIORITY_RULES, isDefault: true }
const project = { _id: 'p1', repo: 'o/app', entryColumnKey: 'todo', closedColumnKey: null } as never

const issue = (overrides: Partial<GithubIssueLite> = {}): GithubIssueLite => ({
  number: 7,
  title: 'Bug',
  body: 'Corpo da issue',
  htmlUrl: 'https://github.com/o/app/issues/7',
  state: 'open',
  stateReason: null,
  labels: [],
  type: null,
  milestone: null,
  assignees: [],
  author: { login: 'ana', avatarUrl: null },
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-05T10:00:00Z',
  isPullRequest: false,
  ...overrides,
})

const result = () => ({ created: 0, linked: 0, updated: 0 })

beforeEach(() => {
  vi.clearAllMocks()
  for (const model of Object.values(mocks.models)) model.docs.length = 0
})

describe('processIssue', () => {
  it('issue vinculada: delega ao last-write-wins e não cria tarefa', async () => {
    mocks.findIssueLink.mockResolvedValue({ taskId: 't1' })
    mocks.reconcileTaskIssue.mockResolvedValue('applied')
    const out = result()

    await processIssue(project, issue(), mapping, out)

    expect(mocks.reconcileTaskIssue).toHaveBeenCalled()
    expect(mocks.createTaskFromIssue).not.toHaveBeenCalled()
    expect(mocks.updateIssueState).not.toHaveBeenCalled()
    expect(out).toEqual({ created: 0, linked: 0, updated: 0 })
  })

  it('issue nova não citada: cria a tarefa com a descrição verbatim e o vínculo do GitHub', async () => {
    mocks.findIssueLink.mockResolvedValue(null)
    mocks.createTaskFromIssue.mockResolvedValue({ id: 't9', code: 'APP-9' })
    const out = result()

    await processIssue(project, issue(), mapping, out)

    expect(mocks.createTaskFromIssue).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bug', description: 'Corpo da issue', columnId: 'todo' }))
    expect(mocks.createIssueLink).toHaveBeenCalledWith(expect.objectContaining({ repo: 'o/app', number: 7, taskId: 't9', origin: 'github', issueUpdatedAt: new Date('2026-10-05T10:00:00Z') }))
    expect(out.created).toBe(1)
  })

  it('issue citada por uma tarefa existente: só vincula', async () => {
    mocks.findIssueLink.mockResolvedValue(null)
    await mocks.models.devTask.create({ code: 'APP-3', projectId: 'p1', title: 'Ver o/app#7', description: null, technicalSpec: null })
    const out = result()

    await processIssue(project, issue(), mapping, out)

    expect(mocks.createTaskFromIssue).not.toHaveBeenCalled()
    expect(mocks.createIssueLink).toHaveBeenCalledWith(expect.objectContaining({ taskId: expect.any(String), origin: 'github' }))
    expect(out.linked).toBe(1)
  })

  it('pull requests são ignorados', async () => {
    const out = result()
    await processIssue(project, issue({ isPullRequest: true }), mapping, out)
    expect(mocks.findIssueLink).not.toHaveBeenCalled()
    expect(out).toEqual({ created: 0, linked: 0, updated: 0 })
  })
})
