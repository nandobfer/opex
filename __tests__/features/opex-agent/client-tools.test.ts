import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listClientTasks: vi.fn(),
  getClientTask: vi.fn(),
  addClientComment: vi.fn(async () => {}),
  setClientTaskPriority: vi.fn(async () => {}),
  getClientOptions: vi.fn(),
  createDraft: vi.fn(),
  getDraft: vi.fn(),
  setDraftCorrection: vi.fn(),
  approveDraft: vi.fn(),
  listDrafts: vi.fn(),
  getDraftDoc: vi.fn(),
  linkAttachmentsToDraft: vi.fn(async () => {}),
  buildClientDashboard: vi.fn(async () => ({ range: {} })),
  listClientCost: vi.fn(async () => ({ groups: [] })),
  getClientServiceDetail: vi.fn(async () => ({ id: 's1' })),
  listClientUsers: vi.fn(async () => []),
  updateClientUser: vi.fn(async () => ({ id: 'u1', username: 'ana', email: null, admin: false, active: true })),
  deleteClientUser: vi.fn(async () => {}),
}))

vi.mock('@/features/orcamentos/server/portal', () => ({
  listClientTasks: mocks.listClientTasks,
  getClientTask: mocks.getClientTask,
  addClientComment: mocks.addClientComment,
  setClientTaskPriority: mocks.setClientTaskPriority,
  getClientOptions: mocks.getClientOptions,
  createDraft: mocks.createDraft,
  getDraft: mocks.getDraft,
  setDraftCorrection: mocks.setDraftCorrection,
  approveDraft: mocks.approveDraft,
}))
vi.mock('@/features/orcamentos/server/drafts', () => ({
  clientScope: (client: { _id: string; name: string }) => ({ kind: 'client', clientId: String(client._id), name: client.name }),
  listDrafts: mocks.listDrafts,
  getDraftDoc: mocks.getDraftDoc,
  assertDraftEditable: () => {},
}))
vi.mock('@/features/orcamentos/server/preview', () => ({
  prepareBudgetPreview: async () => ({}),
  runBudgetPreview: async function* () {
    yield { type: 'done', preview: { title: 'T', taskType: null, priority: 'medium', technicalSpec: 'x', summary: 'y', tags: [], clarity: null } }
  },
  prepareBudgetEstimate: async () => ({}),
  runBudgetEstimate: async function* () {
    yield { type: 'done', estimate: { hours: 8, clientHours: 16, billingBrl: 1600 }, tags: [] }
  },
}))
vi.mock('@/features/orcamentos/server/portal-dashboard', () => ({ buildClientDashboard: mocks.buildClientDashboard }))
vi.mock('@/features/orcamentos/server/portal-finance', () => ({ listClientCost: mocks.listClientCost }))
vi.mock('@/features/orcamentos/server/portal-services', () => ({ getClientServiceDetail: mocks.getClientServiceDetail }))
vi.mock('@/features/orcamentos/server/users', () => ({
  listClientUsers: mocks.listClientUsers,
  updateClientUser: mocks.updateClientUser,
  deleteClientUser: mocks.deleteClientUser,
}))
vi.mock('@/features/tasks/attachments/server/service', () => ({ linkAttachmentsToDraft: mocks.linkAttachmentsToDraft }))

import { OPEX_CLIENT_CONTEXT_TOOL, OPEX_CLIENT_TOOLS, OPEX_CLIENT_TOOL_GROUPS, opexClientToolsFor } from '@/features/opex-agent/client-tools'
import { OPEX_CLIENT_SERVER_TOOLS, enabledClientOpexServerTools, findOpexClientServerTool } from '@/features/opex-agent/server/client-tools/registry'
import type { ClientActor } from '@/features/auth/server/context'
import type { OpexToolContext } from '@/features/opex-agent/server/tools/define'

const actor = (isAdmin: boolean): ClientActor =>
  ({
    userId: 'u1',
    displayName: 'Ana',
    username: 'ana',
    email: null,
    client: { _id: 'c1', name: 'ACME', projectIds: ['p1'] },
    isAdmin,
    preview: false,
  }) as unknown as ClientActor

const context = (isAdmin = false): OpexToolContext => ({ sessionId: 's1', actorId: 'u1', scope: { kind: 'client', actor: actor(isAdmin) } })

const OWN_TASK = {
  id: 't1',
  code: 'OPX-1',
  title: 'Corrigir login',
  columnId: 'backlog',
  taskType: 'fix',
  priority: 'high',
  project: { id: 'p1', name: 'App', repo: 'acme/app' },
  summary: 'Resumo',
  archived: false,
  updatedAt: '2026-10-19T00:00:00.000Z',
  estimate: { clientHours: 4, billingBrl: 400 },
}

const DRAFT = {
  id: 'd1',
  projectId: 'p1',
  projectName: 'App',
  projectRepo: null,
  description: 'Pedido',
  correction: null,
  preview: null,
  tags: [],
  model: 'gemini',
  status: 'draft',
  taskId: null,
  estimate: { hours: 10, clientHours: 20, billingBrl: 2000 },
  estimateClientId: 'c1',
  estimateClientName: 'ACME',
  createdAt: '2026-10-19T00:00:00.000Z',
}

async function run(toolName: string, input: unknown, ctx: OpexToolContext = context()) {
  const tool = findOpexClientServerTool(toolName)!
  return tool.execute(tool.input.parse(input), ctx) as Promise<Record<string, unknown>>
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listClientTasks.mockResolvedValue({ tasks: [OWN_TASK], fetchedAt: 'x' })
  mocks.getClientTask.mockResolvedValue({ ...OWN_TASK, description: 'Desc', technicalSpec: 'Spec', comments: [], attachmentsCount: 0 })
  mocks.getClientOptions.mockResolvedValue({
    clientName: 'ACME',
    projects: [{ id: 'p1', name: 'App', repo: 'acme/app', sigla: 'AA', ownerAvatarUrl: null, description: null, private: true }],
    board: { columns: [{ key: 'backlog', name: 'Backlog', description: 'Novas' }], layout: [] },
  })
  mocks.createDraft.mockResolvedValue(DRAFT)
  mocks.getDraft.mockResolvedValue(DRAFT)
  mocks.listDrafts.mockResolvedValue([DRAFT])
  mocks.getDraftDoc.mockResolvedValue({ _id: 'd1', status: 'draft', preview: { title: 'T' }, description: 'Pedido', projectId: 'p1' })
  mocks.approveDraft.mockResolvedValue({ id: 't9', code: 'OPX-9', title: 'T', priority: 'high', columnId: 'backlog' })
})

describe('catálogo de ferramentas do portal', () => {
  it('o registro executável bate com o catálogo da tela', () => {
    const names = OPEX_CLIENT_SERVER_TOOLS.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(OPEX_CLIENT_TOOLS.map((tool) => tool.name))
    for (const tool of OPEX_CLIENT_SERVER_TOOLS) {
      const meta = OPEX_CLIENT_TOOLS.find((item) => item.name === tool.name)!
      expect({ name: tool.name, group: tool.group, label: tool.label, risk: tool.risk }).toEqual({ name: meta.name, group: meta.group, label: meta.label, risk: meta.risk })
      expect(OPEX_CLIENT_TOOL_GROUPS).toContain(tool.group)
      expect(tool.description.length).toBeGreaterThan(10)
    }
    for (const tool of OPEX_CLIENT_SERVER_TOOLS.filter((item) => item.risk === 'destructive')) expect(typeof tool.summarize).toBe('function')
  })

  it('o contexto fica sempre; adminOnly só chega ao admin do cliente', () => {
    expect(opexClientToolsFor(false).some((tool) => tool.group === 'finance' || tool.group === 'users')).toBe(false)
    expect(opexClientToolsFor(true).some((tool) => tool.name === 'delete_user')).toBe(true)

    const nonAdmin = enabledClientOpexServerTools([], false)
    expect(nonAdmin.some((tool) => tool.name === 'delete_user' || tool.name === 'get_finance')).toBe(false)
    expect(nonAdmin.some((tool) => tool.name === OPEX_CLIENT_CONTEXT_TOOL)).toBe(true)

    const admin = enabledClientOpexServerTools(OPEX_CLIENT_TOOLS.map((tool) => tool.name), true)
    expect(admin.some((tool) => tool.name === 'delete_user')).toBe(true)
  })

  it('respeita a seleção do dono (só as ferramentas ligadas)', () => {
    const tools = enabledClientOpexServerTools(['list_tasks'], false)
    expect(tools.map((tool) => tool.name).sort()).toEqual([OPEX_CLIENT_CONTEXT_TOOL, 'list_tasks'].sort())
  })
})

describe('ferramentas do portal respeitam o escopo do usuário', () => {
  it('a visão geral usa o cliente e o papel do ator', async () => {
    const result = await run('get_portal_overview', {})
    expect(result).toMatchObject({ client: { id: 'c1', name: 'ACME' }, user: { name: 'Ana', role: 'usuário' } })
    expect(mocks.getClientOptions).toHaveBeenCalledWith(expect.objectContaining({ _id: 'c1' }))
  })

  it('listar e ler tarefas só enxerga as tarefas do cliente', async () => {
    const list = await run('list_tasks', { search: 'login' })
    expect(list.total).toBe(1)
    expect(mocks.listClientTasks).toHaveBeenCalledWith(expect.objectContaining({ _id: 'c1' }), false)

    await expect(run('get_task', { task: 'OUT-9' })).rejects.toThrow('não encontrada')
  })

  it('comentar usa o usuário do portal como autor', async () => {
    await run('add_comment', { task: 'OPX-1', content: 'Podemos revisar?' })
    expect(mocks.addClientComment).toHaveBeenCalledWith(expect.objectContaining({ _id: 'c1' }), 't1', 'Podemos revisar?', { id: 'u1', name: 'Ana' })
  })

  it('a prévia lida pelo agente não expõe horas reais nem o modelo', async () => {
    const preview = await run('get_preview', { previewId: 'd1' })
    expect(preview.estimate).toEqual({ clientHours: 20, billingBRL: 2000 })
    expect(JSON.stringify(preview)).not.toContain('hours')
    expect(JSON.stringify(preview)).not.toContain('gemini')
  })

  it('estimar a prévia devolve só horas infladas e faturamento', async () => {
    const result = (await run('estimate_preview', { previewId: 'd1' })) as unknown as { estimate: Record<string, unknown> }
    expect(result.estimate).toEqual({ clientHours: 16, billingBRL: 1600 })
    expect(JSON.stringify(result)).not.toContain('hours')
  })

  it('criar prévia usa o cliente do ator (repositório permitido é validado no serviço)', async () => {
    await run('create_preview', { projectId: 'p1', description: 'Quero uma tela nova de pedidos' })
    expect(mocks.createDraft).toHaveBeenCalledWith(expect.objectContaining({ _id: 'c1' }), { projectId: 'p1', description: 'Quero uma tela nova de pedidos' })
  })

  it('o financeiro usa o cliente do ator e o papel só do admin', async () => {
    await run('get_finance', {}, context(true))
    expect(mocks.listClientCost).toHaveBeenCalledWith('c1', expect.objectContaining({ from: expect.any(String), to: expect.any(String) }))
    expect(findOpexClientServerTool('get_finance')?.adminOnly).toBe(true)
  })

  it('a lista de usuários nunca leva token de login ao modelo', async () => {
    mocks.listClientUsers.mockResolvedValueOnce([
      { id: 'u1', username: 'ana', email: null, admin: true, isDefault: true, active: true, portalPath: '/cliente?t=cli_segredo', memberships: [], createdAt: null },
    ])
    const users = (await run('list_users', {}, context(true))) as unknown as unknown[]
    expect(JSON.stringify(users)).not.toContain('cli_segredo')
    expect(users[0]).toMatchObject({ id: 'u1', username: 'ana', admin: true })
  })

  it('remover usuário é destrutivo e avisa o que será feito', () => {
    const tool = findOpexClientServerTool('delete_user')!
    expect(tool.risk).toBe('destructive')
    expect(tool.summarize!(tool.input.parse({ userId: 'u2', username: 'bia' }))).toBe('Remover o usuário bia do cliente')
  })

  it('editar usuário nunca guarda a senha no histórico', () => {
    const tool = findOpexClientServerTool('update_user')!
    const input = tool.input.parse({ userId: 'u2', username: 'bia', email: '', admin: true, password: 'segredo123' })
    const redacted = tool.redact!(input) as Record<string, unknown>
    expect(JSON.stringify(redacted)).not.toContain('segredo123')
    expect(redacted.password).toBe('[senha omitida]')
  })
})
