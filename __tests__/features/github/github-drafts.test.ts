import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel, type MemoryModel } from '../../helpers/memory-model'

const mocks = vi.hoisted(() => ({
  models: {} as Record<string, MemoryModel>,
  recordAudit: vi.fn(),
  publish: vi.fn(),
  github: { request: vi.fn(), requestFull: vi.fn(), paginate: vi.fn(), download: vi.fn() },
  go: { createGoTask: vi.fn(), listGoProductTasks: vi.fn(), listGoWorkPackages: vi.fn(), updateGoTaskDescription: vi.fn(), uploadGoAttachment: vi.fn() },
  people: new Map<string, { id: string; name: string; email: string | null }>(),
  moveTask: vi.fn(),
  configs: {
    github: { apiUrl: 'https://api.github.com', commentOnCreate: true, token: 'ghp_x' },
    go_sipal: { baseUrl: 'https://go.sipal.com.br', token: 'jwt' },
  } as Record<string, Record<string, unknown>>,
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', MOVER: 'MOVER', ATRIBUIR: 'ATRIBUIR' } }))
vi.mock('@/lib/db/models/Github', () => ({
  get TaskDraft() { return mocks.models.drafts },
  get GithubIssueLink() { return mocks.models.issueLinks },
  get GithubRepoLink() { return mocks.models.links },
  get GithubPerson() { return mocks.models.people },
}))
vi.mock('@/lib/db/models/TaskBoard', () => ({
  get TaskBoardColumn() { return mocks.models.columns },
  get TaskLocalState() { return mocks.models.states },
}))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async (id: string) => mocks.configs[id] }))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), request: vi.fn(), response: vi.fn() }) }))
vi.mock('@/lib/pusher/channels', () => ({ appChannel: () => 'private-app', publishToChannels: mocks.publish }))
vi.mock('@/features/github/client', () => ({
  githubRequest: mocks.github.request,
  githubRequestFull: mocks.github.requestFull,
  githubPaginate: mocks.github.paginate,
  githubDownload: mocks.github.download,
}))
vi.mock('@/features/github/server/go-sipal', () => mocks.go)
vi.mock('@/features/github/server/mappings', async () => {
  const logic = await import('@/features/github/logic')
  return { getMapping: async () => ({ typeRules: logic.DEFAULT_TYPE_RULES, priorityRules: logic.DEFAULT_PRIORITY_RULES, isDefault: true }) }
})
vi.mock('@/features/github/server/people', () => ({ peopleMap: async () => mocks.people, upsertSeenPeople: async () => 0 }))
vi.mock('@/features/tasks/server/service', async () => {
  const { DomainError } = await import('@/lib/api/route')
  return {
    fetchAllTasks: async () => [],
    moveTask: mocks.moveTask,
    toTaskDomainError: (error: Error) => {
      throw new DomainError(502, error.message, 'GO_SIPAL_UNAVAILABLE')
    },
  }
})

import { GoSipalError } from '@/features/go-sipal/client'
import { toIssueLite, type GithubIssueLite } from '@/features/github/logic'
import { buildMappingContext, discardDraft, listBoardDrafts, refreshDraftFromIssue, restoreDraft, sendDraft, updateDraft } from '@/features/github/server/drafts'
import { closeLinkedIssue, handleClosedIssue, onTaskStatusChanged } from '@/features/github/server/issue-links'
import { processIssue } from '@/features/github/server/sync'
import type { IGithubIssueLink, IGithubRepoLink, ITaskDraft } from '@/lib/db/models/Github'
import type { TaskDto } from '@/features/tasks/types'

const COLUMN = 'custom-entrada01'
const PRODUCT = 'b'.repeat(24)
const link = { repo: 'sipal/app', repoUrl: 'https://github.com/sipal/app', productId: PRODUCT, productName: 'App', authors: ['fernand'], entryColumnKey: COLUMN, defaultType: 'feature', defaultPriority: 'medium', enabled: true } as unknown as IGithubRepoLink

const issue = (overrides: Record<string, unknown> = {}): GithubIssueLite =>
  toIssueLite({
    number: 12,
    title: 'Erro no login',
    body: 'Passos ![tela](https://github.com/user-attachments/assets/abc)',
    html_url: 'https://github.com/sipal/app/issues/12',
    state: 'open',
    user: { login: 'fernand' },
    labels: [{ name: 'bug' }, { name: 'P1' }],
    assignees: [{ login: 'ana' }],
    milestone: { title: 'Sprint 3' },
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    ...overrides,
  })!

const goTask = (overrides: Partial<TaskDto> = {}): TaskDto => ({
  id: 'c'.repeat(24), code: 'GO-DEV-77', title: 'T', status: 'development', order: 0, taskType: 'bugfix', priority: 'high', product: null, workPackage: null,
  assignee: null, commitUrl: null, pullRequestUrl: null, archived: false, createdAt: null, updatedAt: null, ...overrides,
})

async function ingest(value: GithubIssueLite, productTasks: { task: TaskDto; text: string }[] = []) {
  const result = { created: 0, linked: 0, updated: 0, moved: [] as string[] }
  await processIssue(link, value, { ctx: await buildMappingContext(), productTasks: async () => productTasks, tasksById: new Map(), initial: true }, result, new Set())
  return result
}

const draftDoc = () => mocks.models.drafts.docs[0] as unknown as ITaskDraft & { _id: string }
const draftId = () => `draft-${draftDoc()._id}`

beforeEach(() => {
  vi.clearAllMocks()
  mocks.models = { drafts: memoryModel(), issueLinks: memoryModel(), links: memoryModel(), people: memoryModel(), columns: memoryModel(), states: memoryModel() }
  mocks.models.links.docs.push({ _id: 'l1', ...link })
  mocks.models.columns.docs.push({ key: COLUMN, name: 'Entrada' })
  mocks.people = new Map([['ana', { id: 'd'.repeat(24), name: 'Ana', email: null }]])
  mocks.configs.github!.commentOnCreate = true
  mocks.go.listGoWorkPackages.mockResolvedValue([{ id: 'e'.repeat(24), name: 'Sprint 3' }])
  mocks.go.listGoProductTasks.mockResolvedValue([])
  mocks.github.request.mockResolvedValue({ body_html: '<img src="https://private-user-images.githubusercontent.com/a?jwt=1">' })
  mocks.github.download.mockResolvedValue({ bytes: new ArrayBuffer(3), contentType: 'image/png' })
})

describe('issue nova → rascunho', () => {
  it('autor configurado: rascunho na coluna de entrada com os campos mapeados', async () => {
    expect(await ingest(issue())).toMatchObject({ created: 1 })
    expect(draftDoc()).toMatchObject({
      repo: 'sipal/app', number: 12, columnKey: COLUMN, state: 'draft', productId: PRODUCT,
      taskType: 'bugfix', priority: 'high', assigneeId: 'd'.repeat(24), workPackageName: 'Sprint 3', title: 'Erro no login',
      origins: { taskType: 'label "bug"', priority: 'label "P1"', assignee: 'assignee @ana', workPackage: 'milestone "Sprint 3"' },
    })
    const [task] = await listBoardDrafts()
    expect(task).toMatchObject({ code: 'app#12', localColumn: COLUMN, draft: { repo: 'sipal/app', number: 12, issueClosed: false }, issue: { url: 'https://github.com/sipal/app/issues/12' } })
    expect(task!.id).toMatch(/^draft-[a-f0-9]{24}$/)
  })

  it('ignora autor fora da lista, PR e issue já fechada', async () => {
    await ingest(issue({ user: { login: 'outro' } }))
    await ingest(issue({ number: 13, pull_request: { url: 'x' } }))
    await ingest(issue({ number: 14, state: 'closed' }))
    expect(mocks.models.drafts.docs).toHaveLength(0)
  })

  it('tarefa do produto que já cita #12 só ganha o vínculo (sem rascunho)', async () => {
    const result = await ingest(issue(), [{ task: goTask(), text: 'Corrige o login (#12)' }])
    expect(result).toMatchObject({ created: 0, linked: 1 })
    expect(mocks.models.drafts.docs).toHaveLength(0)
    expect(mocks.models.issueLinks.docs[0]).toMatchObject({ repo: 'sipal/app', number: 12, goTaskId: 'c'.repeat(24), source: 'detected' })
  })

  it('rascunho descartado não é recriado pela sincronização', async () => {
    await ingest(issue())
    await discardDraft(draftId(), 'local')
    await ingest(issue({ updated_at: '2026-03-02T10:00:00Z' }))
    expect(mocks.models.drafts.docs).toHaveLength(1)
    expect(draftDoc().state).toBe('discarded')
    expect(await listBoardDrafts()).toHaveLength(0)
  })
})

describe('issue editada / fechada antes do envio', () => {
  it('atualiza só o que não foi editado; fechar só marca o rascunho', async () => {
    await ingest(issue())
    await updateDraft(draftId(), { title: 'Meu título' }, 'local')
    const ctx = await buildMappingContext()
    await refreshDraftFromIssue(draftDoc(), issue({ title: 'Novo da issue', labels: [{ name: 'enhancement' }], state: 'closed' }), ctx)
    expect(draftDoc()).toMatchObject({ title: 'Meu título', issueTitle: 'Novo da issue', taskType: 'feature', issueState: 'closed', state: 'draft' })
    expect((await listBoardDrafts())[0]).toMatchObject({ draft: { issueClosed: true } })

    await updateDraft(draftId(), { restore: ['title'] }, 'local')
    expect(draftDoc()).toMatchObject({ title: 'Novo da issue', edited: [] })
  })

  it('descartar e restaurar (volta para a coluna; auditado)', async () => {
    await ingest(issue())
    await discardDraft(draftId(), 'local')
    expect(draftDoc().state).toBe('discarded')
    await restoreDraft(draftId(), 'local')
    expect(draftDoc()).toMatchObject({ state: 'draft', columnKey: COLUMN, discardedAt: null })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'RascunhoTarefa', acao: 'EXCLUIR' }))
  })
})

describe('enviar para o Go! Sipal', () => {
  it('cria no status escolhido, anexa a imagem, troca o link, comenta na issue e vincula', async () => {
    await ingest(issue())
    mocks.go.createGoTask.mockResolvedValue(goTask({ status: 'specification' }))
    const result = await sendDraft(draftId(), { status: 'specification', priority: 'urgent' }, 'local')

    expect(mocks.go.createGoTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro no login', product: PRODUCT, status: 'specification', taskType: 'bugfix', priority: 'urgent', assignee: 'd'.repeat(24), workPackage: 'e'.repeat(24) }))
    expect(mocks.go.createGoTask.mock.calls[0]![0].description).toContain('Issue: https://github.com/sipal/app/issues/12')
    expect(mocks.github.download).toHaveBeenCalledWith('https://private-user-images.githubusercontent.com/a?jwt=1')
    expect(mocks.go.uploadGoAttachment).toHaveBeenCalledWith('c'.repeat(24), expect.objectContaining({ name: 'issue-12-imagem-1.png' }))
    expect(mocks.go.updateGoTaskDescription.mock.calls[0]![1]).toContain('📎 Imagem 1 (anexo issue-12-imagem-1.png)')
    expect(mocks.github.request).toHaveBeenCalledWith('/repos/sipal/app/issues/12/comments', expect.objectContaining({ method: 'POST' }))
    expect(result).toEqual({ taskId: 'c'.repeat(24), code: 'GO-DEV-77', images: { total: 1, attached: 1 }, commented: true })
    expect(draftDoc()).toMatchObject({ state: 'sent', goTaskCode: 'GO-DEV-77', edited: ['priority'] })
    expect(mocks.models.issueLinks.docs[0]).toMatchObject({ goTaskId: 'c'.repeat(24), source: 'draft' })
    await expect(sendDraft(draftId(), { status: 'backlog' }, 'local')).rejects.toMatchObject({ status: 409, code: 'DRAFT_SENT' })
  })

  it('sem resposta do Go! Sipal: fica "enviando" e a nova tentativa acha a tarefa pela URL (sem duplicar)', async () => {
    await ingest(issue())
    mocks.configs.github!.commentOnCreate = false
    mocks.go.createGoTask.mockRejectedValueOnce(new GoSipalError('O Go! Sipal não respondeu a tempo', 'UNAVAILABLE'))
    await expect(sendDraft(draftId(), { status: 'backlog' }, 'local')).rejects.toMatchObject({ status: 502 })
    expect(draftDoc().state).toBe('sending')

    mocks.go.listGoProductTasks.mockResolvedValue([{ task: goTask(), text: 'x\nIssue: https://github.com/sipal/app/issues/12' }])
    const result = await sendDraft(draftId(), { status: 'backlog' }, 'local')
    expect(mocks.go.createGoTask).toHaveBeenCalledTimes(1)
    expect(result.code).toBe('GO-DEV-77')
    expect(draftDoc().state).toBe('sent')
  })

  it('recusa da plataforma volta o rascunho para "draft"', async () => {
    await ingest(issue())
    mocks.go.createGoTask.mockRejectedValueOnce(new GoSipalError('Produto não encontrado', 'REJECTED', 404))
    await expect(sendDraft(draftId(), { status: 'backlog' }, 'local')).rejects.toBeTruthy()
    expect(draftDoc().state).toBe('draft')
  })
})

describe('issue ↔ tarefa', () => {
  const issueLink = (overrides: Partial<IGithubIssueLink> = {}) => {
    const doc = { repo: 'sipal/app', number: 12, url: 'https://github.com/sipal/app/issues/12', goTaskId: 'c'.repeat(24), goTaskCode: 'GO-DEV-77', source: 'draft', issueState: 'closed', issueStateReason: 'completed', pendingCommitUntil: null, notice: null, ...overrides } as IGithubIssueLink
    mocks.models.issueLinks.docs.push({ ...doc } as unknown as Record<string, unknown>)
    return doc
  }

  it('fechada: tarefa em Desenvolvimento vai para Validação com o commit que fechou (e o PR)', async () => {
    mocks.github.paginate.mockResolvedValue([{ event: 'closed', commit_id: 'abc', commit_url: 'https://api.github.com/repos/sipal/app/commits/abc' }, { event: 'cross-referenced', source: { issue: { number: 625, repository: { full_name: 'sipal/app' }, pull_request: { merged_at: '2026-01-01' } } } }])
    mocks.github.request.mockResolvedValue({ html_url: 'https://github.com/sipal/app/pull/625', merge_commit_sha: 'abc', merged_at: '2026-01-01' })
    await handleClosedIssue(issueLink(), goTask())
    expect(mocks.moveTask).toHaveBeenCalledWith('c'.repeat(24), expect.objectContaining({ targetStatus: 'validation', commitUrl: 'https://github.com/sipal/app/commit/abc', pullRequestUrl: 'https://github.com/sipal/app/pull/625' }), 'github', { skipIssueSync: true })
  })

  it('sem commit: aguarda (tenta por 24 h); tipo sem código move sem commit; não planejada não move', async () => {
    mocks.github.paginate.mockResolvedValue([])
    await handleClosedIssue(issueLink(), goTask())
    expect(mocks.moveTask).not.toHaveBeenCalled()
    expect(mocks.models.issueLinks.docs[0]).toMatchObject({ notice: expect.stringContaining('aguardando o commit') })
    expect(mocks.models.issueLinks.docs[0]!.pendingCommitUntil).toBeInstanceOf(Date)

    await handleClosedIssue(issueLink({ number: 13 }), goTask({ taskType: 'analysis' }))
    expect(mocks.moveTask).toHaveBeenCalledWith('c'.repeat(24), expect.not.objectContaining({ commitUrl: expect.anything() }), 'github', { skipIssueSync: true })

    mocks.moveTask.mockClear()
    await handleClosedIssue(issueLink({ number: 14, issueStateReason: 'not_planned' }), goTask())
    expect(mocks.moveTask).not.toHaveBeenCalled()
    await handleClosedIssue(issueLink({ number: 15 }), goTask({ status: 'specification' }))
    expect(mocks.moveTask).not.toHaveBeenCalled()
  })

  it('tarefa em Validação fecha a issue aberta; issue já fechada é ignorada (sem laço)', async () => {
    issueLink({ issueState: 'open', issueStateReason: null })
    await onTaskStatusChanged('c'.repeat(24), 'development', 'GO-DEV-77')
    expect(mocks.github.request).not.toHaveBeenCalled()
    await onTaskStatusChanged('c'.repeat(24), 'validation', 'GO-DEV-77')
    expect(mocks.github.request).toHaveBeenCalledWith('/repos/sipal/app/issues/12', expect.objectContaining({ method: 'PATCH', body: { state: 'closed', state_reason: 'completed' } }))
    expect(mocks.models.issueLinks.docs[0]).toMatchObject({ issueState: 'closed' })
    mocks.github.request.mockClear()
    expect(await closeLinkedIssue(mocks.models.issueLinks.docs[0] as unknown as IGithubIssueLink, 'GO-DEV-77')).toBe(false)
    expect(mocks.github.request).not.toHaveBeenCalled()
  })
})
