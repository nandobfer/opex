import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * MCP "Mesa do Opex" (OPE-178): somente leitura, autenticado pelo segredo derivado e com o escopo pela
 * sessão do OpenCode. Serve só a mesa dona da sessão (mesa, fork ou subagente deles); qualquer outra
 * sessão é recusada. Links e conteúdo dos anexos são gerados na hora da consulta. Storage sempre mockado.
 */

const mocks = vi.hoisted(() => ({
  getFileUrl: vi.fn(),
  getFileObject: vi.fn(),
  getTask: vi.fn(),
  sessionGet: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/crypto/secretBox', () => ({ deriveSubkey: () => Buffer.from('segredo-da-mesa') }))
vi.mock('@/lib/storage/s3', () => ({ getFileUrl: mocks.getFileUrl, getFileObject: mocks.getFileObject }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: vi.fn(async () => ({ session: { get: mocks.sessionGet } })) }))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AgenticWorkbench: memoryModel(), AgenticFork: memoryModel(), AgenticFile: memoryModel() }
})
vi.mock('@/lib/db/models/TaskAttachment', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { TaskAttachment: memoryModel() }
})
vi.mock('@/features/agentic/server/centrals', () => ({ loadCentral: vi.fn(async () => ({ config: { include: { comments: true, history: false } } })) }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.getTask }))
vi.mock('@/features/ai/task-context-prompt', () => ({ buildTaskContextPrompt: vi.fn((task: { code: string; description: string }) => `# ${task.code}\n${task.description}`) }))

import { AgenticFile, AgenticFork, AgenticWorkbench } from '@/lib/db/models/Agentic'
import { TaskAttachment } from '@/lib/db/models/TaskAttachment'
import { handleWorkbenchMcpRequest } from '@/features/agentic/server/workbench-mcp/server'
import { workbenchToolDescriptors } from '@/features/agentic/server/workbench-mcp/tools'
import { workbenchMcpSecret } from '@/features/agentic/server/workbench-mcp/register'

type Docs = { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: unknown }> }
const workbenches = AgenticWorkbench as unknown as Docs
const forks = AgenticFork as unknown as Docs
const files = AgenticFile as unknown as Docs
const taskFiles = TaskAttachment as unknown as Docs

const PLANS = [
  { version: 1, text: '# Plano v1', feedback: null, createdAt: new Date('2026-11-22T02:53:00Z') },
  { version: 2, text: '# Plano v2\nAbas completas', feedback: 'Formulário completo', createdAt: new Date('2026-11-22T13:30:00Z') },
  { version: 3, text: '# Plano v3', feedback: 'ajuste', createdAt: new Date('2026-11-22T13:46:00Z') },
]

let rpcId = 0
async function call(name: string, args: Record<string, unknown> = {}, sessionId: string | null = 'sess-mesa', authorization = `Bearer ${workbenchMcpSecret()}`) {
  const body = { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args, ...(sessionId ? { _meta: { 'ai.opencode/sessionID': sessionId } } : {}) } }
  const response = await handleWorkbenchMcpRequest(new Request('http://opex/api/agentic/mcp', { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  const json = (await response.json()) as { result?: { content: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean } }
  return { status: response.status, result: json.result!, text: json.result?.content[0]?.text ?? '' }
}

let workbenchId = ''
let forkId = ''

beforeEach(async () => {
  vi.clearAllMocks()
  for (const model of [workbenches, forks, files, taskFiles]) model.docs.length = 0
  mocks.sessionGet.mockResolvedValue({ parentID: null })
  mocks.getFileUrl.mockImplementation(async (key: string) => `https://s3.local/${key}?sig=${Date.now()}-${Math.random()}`)
  mocks.getTask.mockResolvedValue({ code: 'ZC-17', description: 'Descrição completa da tarefa' })
  const wb = await workbenches.create({ centralId: 'c1', taskId: 't1', taskCode: 'ZC-17', taskTitle: 'Cadastros', stage: 'implementing', runState: 'running', sessionId: 'sess-mesa', branch: 'feat/zc-17', worktreePath: '/w/zc-17', plans: PLANS, approvedPlanVersion: 2, forkNotes: [{ forkId: 'f', number: 1, summary: '## Resumo\nDescoberta', createdAt: new Date() }], pr: null, previewUrl: null })
  workbenchId = String(wb._id)
  const fork = await forks.create({ workbenchId, centralId: 'c1', taskId: 't1', taskCode: 'ZC-17', number: 2, status: 'active', sessionId: 'sess-fork', forkedFromStage: 'implementing', summary: null })
  forkId = String(fork._id)
  // Outra mesa (e uma sessão antiga já desvinculada desta) — nunca podem ser atendidas pela sessão de outra.
  await workbenches.create({ centralId: 'c1', taskId: 't2', taskCode: 'ZC-18', taskTitle: 'Outra', stage: 'planning', sessionId: 'sess-outra', plans: [{ version: 1, text: 'segredo da outra mesa', feedback: null }] })
  await files.create({ workbenchId, forkId: null, name: 'print.png', mediaType: 'image/png', size: 4, key: 'agentic/files/1/print.png', ready: true, createdAt: new Date('2026-11-22T10:00:00Z') })
  await files.create({ workbenchId, forkId, name: 'notas.txt', mediaType: 'text/plain', size: 5, key: 'agentic/files/2/notas.txt', ready: true, createdAt: new Date('2026-11-22T11:00:00Z') })
  await files.create({ workbenchId: 'outra', forkId: null, name: 'alheio.txt', mediaType: 'text/plain', size: 5, key: 'agentic/files/3/alheio.txt', ready: true })
  await taskFiles.create({ taskId: 't1', status: 'ready', name: 'spec.pdf', mimeType: 'application/pdf', size: 10, key: 'tasks/spec.pdf', createdAt: new Date('2026-11-21T10:00:00Z') })
})

describe('autenticação e escopo', () => {
  it('sem o segredo: 401', async () => {
    const response = await call('get_plan', {}, 'sess-mesa', 'Bearer errado')
    expect(response.status).toBe(401)
  })

  it('sessão desconhecida, sessão de outra mesa ou chamada sem sessão: recusa sem vazar dados', async () => {
    const unknown = await call('get_plan', {}, 'sess-antiga-desvinculada')
    expect(unknown.result.isError).toBe(true)
    expect(unknown.text).toContain('não é a conversa atual de uma mesa')
    const noSession = await call('get_plan', {}, null)
    expect(noSession.result.isError).toBe(true)
    const other = await call('get_plan', {}, 'sess-outra')
    expect(other.text).toContain('segredo da outra mesa')
    expect(other.text).not.toContain('Abas completas')
  })

  it('sessão de fork e subagente (sessão-filha) são atendidos com os dados da mesa dona', async () => {
    const fromFork = await call('get_plan', {}, 'sess-fork')
    expect(fromFork.text).toContain('Abas completas')
    mocks.sessionGet.mockImplementation(async ({ sessionID }: { sessionID: string }) => (sessionID === 'sess-sub' ? { parentID: 'sess-mesa' } : { parentID: null }))
    const fromSubagent = await call('get_plan', {}, 'sess-sub')
    expect(fromSubagent.text).toContain('Abas completas')
  })
})

describe('plano, tarefa e forks', () => {
  it('get_plan: por padrão a versão que rege a etapa (aprovada); aceita approved, latest e número', async () => {
    expect((await call('get_plan')).text).toContain('versão 2 (aprovada) de 3')
    expect((await call('get_plan', { version: 'latest' })).text).toContain('# Plano v3')
    expect((await call('get_plan', { version: 'approved' })).text).toContain('Pedido que originou esta versão: Formulário completo')
    expect((await call('get_plan', { version: '1' })).text).toContain('# Plano v1')
    const missing = await call('get_plan', { version: 7 })
    expect(missing.result.isError).toBe(true)
    expect(missing.text).toContain('versões: 1, 2, 3')
  })

  it('get_workbench, list_plan_versions, get_task e list_forks', async () => {
    const overview = JSON.parse((await call('get_workbench')).text)
    expect(overview).toMatchObject({ tarefa: { codigo: 'ZC-17' }, plano: { versaoQueRegeAEtapa: 2, versaoAprovada: 2, versaoMaisRecente: 3, versoes: 3 }, anexos: { mesa: 2, tarefa: 1 } })
    const versions = JSON.parse((await call('list_plan_versions')).text)
    expect(versions.map((item: { versao: number; aprovada: boolean }) => [item.versao, item.aprovada])).toEqual([[1, false], [2, true], [3, false]])
    expect((await call('get_task')).text).toContain('Descrição completa da tarefa')
    const list = JSON.parse((await call('list_forks')).text)
    expect(list).toEqual([expect.objectContaining({ fork: 2, status: 'active', integradoAMesa: false })])
  })
})

describe('anexos', () => {
  it('list_attachments junta os da mesa (com a origem do fork) e os da página da tarefa, só desta mesa', async () => {
    const list = JSON.parse((await call('list_attachments')).text) as { nome: string; origem: string }[]
    expect(list.map((item) => [item.nome, item.origem])).toEqual([
      ['print.png', 'Mesa'],
      ['notas.txt', 'Fork 2'],
      ['spec.pdf', 'Tarefa'],
    ])
  })

  it('get_attachment gera um link NOVO a cada consulta e entrega texto e imagem direto na resposta', async () => {
    const [, notes] = files.docs
    mocks.getFileObject.mockResolvedValue({ body: new Blob(['olá!']).stream() })
    const first = await call('get_attachment', { id: String(notes!._id) })
    expect(first.result.content[1]).toMatchObject({ type: 'text', text: expect.stringContaining('olá!') })
    mocks.getFileObject.mockResolvedValue({ body: new Blob([new Uint8Array([1, 2, 3, 4])]).stream() })
    const image = await call('get_attachment', { id: String(files.docs[0]!._id) })
    expect(image.result.content[1]).toMatchObject({ type: 'image', mimeType: 'image/png', data: Buffer.from([1, 2, 3, 4]).toString('base64') })
    expect(mocks.getFileUrl).toHaveBeenCalledTimes(2)
    const links = [JSON.parse(first.text).link, JSON.parse(image.text).link]
    expect(links[0]).not.toBe(links[1])
  })

  it('anexo da tarefa (PDF) vai pelo link; com o Storage fora do ar, informa que o arquivo existe e o motivo', async () => {
    const pdf = String(taskFiles.docs[0]!._id)
    const ok = JSON.parse((await call('get_attachment', { id: pdf })).text)
    expect(ok.link).toContain('tasks/spec.pdf')
    mocks.getFileUrl.mockRejectedValue(new Error('ECONNREFUSED'))
    const down = await call('get_attachment', { id: pdf })
    const parsed = JSON.parse(down.text)
    expect(parsed.link).toBeNull()
    expect(parsed.aviso).toContain('O arquivo existe na mesa')
    expect(parsed.motivos.join(' ')).toContain('ECONNREFUSED')
  })

  it('anexo de outra mesa não é entregue', async () => {
    const alien = await call('get_attachment', { id: String(files.docs[2]!._id) })
    expect(alien.result.isError).toBe(true)
    expect(mocks.getFileUrl).not.toHaveBeenCalled()
  })
})

describe('catálogo', () => {
  it('só as 7 ferramentas de leitura: nenhuma de escrita, nenhuma do catálogo do Maddox', () => {
    const tools = workbenchToolDescriptors()
    expect(tools.map((tool) => tool.name)).toEqual(['get_workbench', 'get_task', 'get_plan', 'list_plan_versions', 'list_forks', 'list_attachments', 'get_attachment'])
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false)).toBe(true)
    const forbidden = /(create|update|delete|remove|approve|move|set|write|send|grant|invite|criar|atualizar|apagar|aprovar|mover|gravar|conceder|convidar)/i
    expect(tools.filter((tool) => forbidden.test(tool.name))).toEqual([])
  })
})
