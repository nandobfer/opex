import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({
  generated: null as unknown,
  approveOwnerDraft: vi.fn(async () => ({ id: 't9', code: 'OPX-9', title: 'T', columnId: 'backlog', taskType: 'feature', priority: 'high', project: null, tags: [], archived: false, estimate: null, agenticFlow: null, updatedAt: null, summary: null })),
  createOwnerDraft: vi.fn(async (input: { projectId: string; description: string }) => ({ id: 'd'.repeat(24), status: 'draft', ...input, preview: null, tags: [] })),
  linkAttachmentsToDraft: vi.fn(async () => {}),
  copyChatFileToAttachments: vi.fn(async (_sessionId: string, fileId: string) => {
    if (fileId === 'outro') throw new Error(`Arquivo ${fileId} não encontrado nesta sessão`)
    return { id: `att-${fileId}`, name: `${fileId}.png`, markdown: `![${fileId}.png](/api/attachments/att-${fileId}/content)` }
  }),
  getTask: vi.fn(async () => ({ id: 'e'.repeat(24), code: 'OPX-1', description: 'Descrição atual' })),
  updateTask: vi.fn(async () => {}),
  createClient: vi.fn(async () => ({ token: 'tok_segredo', item: { id: 'c1', name: 'ACME', tokenPrefix: 'tok_', portalPath: '/cliente?t=tok_segredo', projectIds: [], projects: [], hourlyRate: 100, profitFactor: 2, active: true, createdAt: null, updatedAt: null } })),
  createService: vi.fn(async (input: Record<string, unknown>) => ({ id: 's1', code: 'SRV-1', serviceDate: '2026-10-19T00:00:00.000Z', description: 'x', ...input })),
  setWorkbenchModel: vi.fn(async () => ({ id: 'w1', stage: 'planning', plans: [], models: { planning: { model: 'anthropic/claude', variant: 'high', overridden: true } } })),
}))

vi.mock('ai', () => ({ dynamicTool: (def: unknown) => def }))
vi.mock('@/features/tasks/server/service', async (original) => ({ ...(await original<object>()), getTask: mocks.getTask, updateTask: mocks.updateTask }))
vi.mock('@/features/opex-agent/server/files', async (original) => ({ ...(await original<object>()), copyChatFileToAttachments: mocks.copyChatFileToAttachments }))
vi.mock('@/features/tasks/attachments/server/service', async (original) => ({ ...(await original<object>()), linkAttachmentsToDraft: mocks.linkAttachmentsToDraft }))
vi.mock('@/features/orcamentos/server/owner', () => ({
  createOwnerDraft: mocks.createOwnerDraft,
  getOwnerDraft: async () => ({ id: 'p1', status: 'draft', preview: null, tags: [] }),
  getOwnerDraftDoc: async () => ({ _id: 'p1', status: 'draft', estimatedHours: null, preview: null }),
  requireOwnerDraftEditable: async () => ({ _id: 'p1', status: 'draft', preview: { title: 'T' } }),
  setOwnerCorrection: async () => ({ id: 'p1', status: 'draft', preview: null, tags: [] }),
  setOwnerEstimateClient: async () => {},
  recomputeOwnerEstimate: async () => ({ estimate: { hours: 4 }, tags: [] }),
  approveOwnerDraft: mocks.approveOwnerDraft,
}))
vi.mock('@/features/orcamentos/server/preview', () => ({
  prepareBudgetPreview: async () => ({}),
  runBudgetPreview: async function* () {
    yield { type: 'done', preview: mocks.generated }
  },
  prepareBudgetEstimate: async () => ({}),
  runBudgetEstimate: async function* () {
    yield { type: 'done', estimate: { hours: 4 }, tags: [] }
  },
}))
vi.mock('@/features/orcamentos/server/clients', async (original) => ({ ...(await original<object>()), createClient: mocks.createClient }))
vi.mock('@/features/services/server/service', async (original) => ({ ...(await original<object>()), createService: mocks.createService }))
vi.mock('@/features/agentic/server/workflow', async (original) => ({ ...(await original<object>()), setWorkbenchModel: mocks.setWorkbenchModel }))

import { DomainError } from '@/lib/api/route'
import { OPEX_TOOL_GROUPS, DEFAULT_OPEX_INSTRUCTIONS } from '@/features/opex-agent/constants'
import { DEFAULT_OPEX_AGENT_SETTINGS } from '@/features/opex-agent/schemas'
import { defineTool } from '@/features/opex-agent/server/tools/define'
import { enabledOpexTools, findOpexTool, needsConfirmation, OPEX_TOOLS } from '@/features/opex-agent/server/tools/registry'
import { buildToolRuntime, compactToolOutput, MAX_TOOL_OUTPUT_CHARS } from '@/features/opex-agent/server/tool-runtime'

type Executable = { execute: (input: unknown, options: { toolCallId: string; abortSignal?: AbortSignal }) => Promise<unknown> }

const context = { sessionId: 's1', actorId: 'local' }
const TASK_ID = 'e'.repeat(24)

describe('registro de ferramentas', () => {
  it('nomes únicos e aceitos pelos provedores, com rótulo, descrição e grupo válidos', () => {
    const names = OPEX_TOOLS.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    for (const tool of OPEX_TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]{2,63}$/)
      expect(tool.label.length).toBeGreaterThan(0)
      expect(tool.description.length).toBeGreaterThan(10)
      expect(OPEX_TOOL_GROUPS).toContain(tool.group)
    }
    for (const group of OPEX_TOOL_GROUPS) expect(OPEX_TOOLS.some((tool) => tool.group === group)).toBe(true)
  })

  it('sem ferramentas de Go! Sipal nem de Recursos beta', () => {
    expect(OPEX_TOOLS.some((tool) => /go_sipal|beta/.test(tool.name))).toBe(false)
  })

  it('toda ferramenta de exclusão, arquivamento, integração ou credencial de cliente é destructive', () => {
    const sensitive = OPEX_TOOLS.filter(
      (tool) =>
        /^(delete|archive|stop|interrupt)_/.test(tool.name) ||
        /_archived$/.test(tool.name) ||
        /token|password|_user$/.test(tool.name) ||
        (tool.group === 'integrations' && tool.risk !== 'read') ||
        tool.name === 'create_client',
    )
    expect(sensitive.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['delete_task', 'set_task_archived', 'delete_workbench', 'delete_central', 'update_integration', 'set_service_archived', 'regenerate_client_token', 'create_client_user', 'update_client_user', 'delete_client_user', 'delete_client']),
    )
    for (const tool of sensitive) expect({ name: tool.name, risk: tool.risk }).toEqual({ name: tool.name, risk: 'destructive' })
    // Toda ferramenta destrutiva tem a frase do card de confirmação.
    for (const tool of OPEX_TOOLS.filter((item) => item.risk === 'destructive')) expect(typeof tool.summarize).toBe('function')
  })

  it('destrutivas sempre pedem confirmação; escritas só na política "Toda alteração"', () => {
    const write = findOpexTool('create_preview')!
    const read = findOpexTool('list_tasks')!
    expect(needsConfirmation(write, 'destructive')).toBe(false)
    expect(needsConfirmation(write, 'writes')).toBe(true)
    expect(needsConfirmation(read, 'writes')).toBe(false)
    expect(needsConfirmation(findOpexTool('delete_task')!, 'destructive')).toBe(true)
  })

  it('grupos desligados saem; o grupo Contexto fica sempre', () => {
    const tools = enabledOpexTools({ ...DEFAULT_OPEX_AGENT_SETTINGS.toolGroups, tasks: false, context: false })
    expect(tools.some((tool) => tool.group === 'tasks')).toBe(false)
    expect(tools.some((tool) => tool.name === 'get_app_overview')).toBe(true)
  })

  it('as instruções padrão citam o fluxo de prévia e a confirmação', () => {
    expect(DEFAULT_OPEX_INSTRUCTIONS).toContain('create_preview')
    expect(DEFAULT_OPEX_INSTRUCTIONS).toContain('confirmation_required')
  })
})

describe('segredos fora do chat', () => {
  it('a configuração de integração nunca guarda o valor dos segredos no histórico', () => {
    const tool = findOpexTool('update_integration')!
    const redacted = tool.redact!(tool.input.parse({ id: 'github', secrets: [{ key: 'token', value: 'ghp_segredo' }, { key: 'outro', value: null }] }))
    expect(JSON.stringify(redacted)).not.toContain('ghp_segredo')
    expect(redacted).toMatchObject({ secrets: [{ key: 'token', value: '[segredo omitido]' }, { key: 'outro', value: null }] })
  })

  it('a senha do usuário do portal não vai para o histórico nem para o card', () => {
    const tool = findOpexTool('create_client_user')!
    const redacted = tool.redact!(tool.input.parse({ clientId: 'c1', username: 'ana', password: 'senha-forte', admin: false }))
    expect(JSON.stringify(redacted)).not.toContain('senha-forte')
  })

  it('criar cliente não devolve o token nem a URL de acesso ao modelo', async () => {
    const tool = findOpexTool('create_client')!
    const result = await tool.execute(tool.input.parse({ name: 'ACME', projectIds: [], hourlyRate: 100, profitFactor: 2, active: true }), context)
    expect(JSON.stringify(result)).not.toContain('tok_segredo')
    expect(result).toMatchObject({ client: { id: 'c1', name: 'ACME' }, note: expect.stringContaining('Integrações › Clientes') })
  })
})

describe('execução das ferramentas (buildToolRuntime)', () => {
  const execute = vi.fn(async (input: { n: number }) => ({ double: input.n * 2 }))
  const reader = defineTool({ name: 'reader', group: 'tasks', label: 'Ler', risk: 'read', description: 'Lê algo do app', input: z.object({ n: z.number() }), execute })
  const destroyer = defineTool({ name: 'destroyer', group: 'tasks', label: 'Excluir', risk: 'destructive', description: 'Exclui algo do app', input: z.object({ id: z.string() }), summarize: (input) => `Excluir ${input.id}`, execute })
  const failing = defineTool({
    name: 'failing',
    group: 'tasks',
    label: 'Falha',
    risk: 'read',
    description: 'Sempre falha',
    input: z.object({}),
    execute: async () => {
      throw new DomainError(409, 'Tarefa já arquivada', 'TASK_ARCHIVED')
    },
  })

  beforeEach(() => vi.clearAllMocks())

  it('executa a leitura e devolve o resultado', async () => {
    const runtime = buildToolRuntime([reader], context, 'destructive', { requestConfirmation: vi.fn() })
    await expect((runtime.tools.reader as unknown as Executable).execute({ n: 2 }, { toolCallId: 'c1' })).resolves.toEqual({ double: 4 })
    expect(runtime.durations.has('c1')).toBe(true)
  })

  it('ação destrutiva não executa: grava a pendência e avisa o modelo para esperar o usuário', async () => {
    const requestConfirmation = vi.fn(async () => ({ actionId: 'a1', summary: 'Excluir x', status: 'pending' as const, error: null }))
    const runtime = buildToolRuntime([destroyer], context, 'destructive', { requestConfirmation })
    const result = await (runtime.tools.destroyer as unknown as Executable).execute({ id: 'x' }, { toolCallId: 'c2' })
    expect(execute).not.toHaveBeenCalled()
    expect(requestConfirmation).toHaveBeenCalledWith(destroyer, { id: 'x' }, 'c2')
    expect(result).toMatchObject({ status: 'confirmation_required', actionId: 'a1', summary: 'Excluir x' })
  })

  it('erro de regra vira mensagem acionável para o modelo', async () => {
    const runtime = buildToolRuntime([failing], context, 'destructive', { requestConfirmation: vi.fn() })
    await expect((runtime.tools.failing as unknown as Executable).execute({}, { toolCallId: 'c3' })).rejects.toThrow('Tarefa já arquivada [TASK_ARCHIVED]')
  })

  it('resultado grande é cortado com aviso', () => {
    expect(compactToolOutput({ items: 'x'.repeat(MAX_TOOL_OUTPUT_CHARS + 10) })).toMatchObject({ truncated: true })
    expect(compactToolOutput({ ok: true })).toEqual({ ok: true })
  })
})

describe('arquivos do chat pelo agente', () => {
  beforeEach(() => vi.clearAllMocks())

  it('copia para os anexos da tarefa (sem novo envio) e, se pedido, insere no fim da descrição', async () => {
    const tool = findOpexTool('attach_files_to_task')!
    const result = (await tool.execute(tool.input.parse({ task: TASK_ID, fileIds: ['f1', 'outro'], appendToDescription: true }), context)) as { attached: unknown[]; failed: { fileId: string }[] }
    expect(mocks.copyChatFileToAttachments).toHaveBeenCalledWith('s1', 'f1', { taskId: TASK_ID }, undefined)
    expect(result.attached).toHaveLength(1)
    expect(result.failed).toEqual([{ fileId: 'outro', error: expect.stringContaining('não encontrado') }])
    expect(mocks.updateTask).toHaveBeenCalledWith(TASK_ID, { description: 'Descrição atual\n\n![f1.png](/api/attachments/att-f1/content)' }, 'local')
  })

  it('create_preview com chatFileIds copia os arquivos, cita na descrição e vincula ao rascunho', async () => {
    const tool = findOpexTool('create_preview')!
    await tool.execute(tool.input.parse({ projectId: 'b'.repeat(24), description: 'Corrigir o erro do print', chatFileIds: ['f1'] }), context)
    expect(mocks.createOwnerDraft).toHaveBeenCalledWith({ projectId: 'b'.repeat(24), description: 'Corrigir o erro do print\n\n![f1.png](/api/attachments/att-f1/content)' })
    expect(mocks.linkAttachmentsToDraft).toHaveBeenCalledWith(expect.objectContaining({ kind: 'owner' }), ['att-f1'], 'd'.repeat(24))
  })
})

describe('prévia e serviços pelo agente', () => {
  beforeEach(() => vi.clearAllMocks())

  it('com critério ausente a aprovação é recusada até corrigir e gerar de novo', async () => {
    const generate = findOpexTool('generate_preview')!
    const approve = findOpexTool('approve_preview')!
    mocks.generated = { title: 'T', taskType: 'feature', priority: 'high', technicalSpec: '', summary: '', tags: [], clarity: { acceptanceCriteria: { status: 'missing', detail: 'sem critério' }, location: { status: 'clear', detail: null } } }
    const result = (await generate.execute(generate.input.parse({ previewId: 'p1', estimate: false }), context)) as { clarity: { canApprove: boolean; guidance: string } }
    expect(result.clarity.canApprove).toBe(false)
    await expect(approve.execute(approve.input.parse({ previewId: 'p1' }), context)).rejects.toThrow(/critérios de aceite ou localização ausentes/)
    expect(mocks.approveOwnerDraft).not.toHaveBeenCalled()

    mocks.generated = { ...(mocks.generated as object), clarity: { acceptanceCriteria: { status: 'clear', detail: null }, location: { status: 'clear', detail: null } } }
    await generate.execute(generate.input.parse({ previewId: 'p1', estimate: false }), context)
    const task = await approve.execute(approve.input.parse({ previewId: 'p1', priority: 'urgent' }), context)
    expect(mocks.approveOwnerDraft).toHaveBeenCalledWith('p1', 'local', 'urgent')
    expect(task).toMatchObject({ code: 'OPX-9' })
  })

  it('criar serviço informa só o campo de origem; o servidor calcula os outros', async () => {
    const tool = findOpexTool('create_service')!
    await tool.execute(tool.input.parse({ clientId: 'c'.repeat(24), description: 'Suporte', serviceDate: '2026-10-19', origin: 'billingBrl', amount: 500 }), context)
    expect(mocks.createService).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'c'.repeat(24), origin: 'billingBrl', billingBrl: 500, hours: 0, clientHours: 0 }), 'local')
  })
})

describe('mesas pelo agente', () => {
  beforeEach(() => vi.clearAllMocks())

  it('troca o modelo de um papel da mesa e rejeita papel inválido', async () => {
    const tool = findOpexTool('set_workbench_model')!
    expect(tool.risk).toBe('write')
    const result = await tool.execute(tool.input.parse({ workbenchId: 'w1', role: 'planning', model: 'anthropic/claude', variant: 'high' }), context)
    expect(mocks.setWorkbenchModel).toHaveBeenCalledWith('w1', { role: 'planning', model: 'anthropic/claude', variant: 'high' })
    expect(result).toMatchObject({ models: { planning: { overridden: true } } })
    expect(() => tool.input.parse({ workbenchId: 'w1', role: 'fork', model: null })).toThrow()
  })
})
