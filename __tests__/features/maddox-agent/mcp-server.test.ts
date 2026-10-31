import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { memoryModel } from '../../helpers/memory-model'

const mocks = vi.hoisted(() => ({
  enabled: true,
  disabledTools: [] as string[],
  clientActorFor: vi.fn(),
  assertClientTool: vi.fn(),
  parentOf: {} as Record<string, string | null>,
  executeOwner: vi.fn(async (input: unknown) => ({ ok: true, input, secret: undefined })),
  executePortal: vi.fn(async () => ({ total: 1 })),
}))

process.env.INTEGRATIONS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('@/lib/db', () => ({ dbConnect: async () => {} }))
const store = vi.hoisted(() => ({ sessions: null as unknown }))
vi.mock('@/lib/db/models/Opex', () => {
  store.sessions = memoryModel()
  return { OpexSession: store.sessions }
})
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: async () => ({ session: { get: async ({ sessionID }: { sessionID: string }) => (sessionID in mocks.parentOf ? { parentID: mocks.parentOf[sessionID] } : null) } }),
}))
vi.mock('@/features/auth/server/context', () => ({ clientActorFor: mocks.clientActorFor }))
vi.mock('@/features/maddox-agent/server/settings', () => ({
  loadMaddoxSettings: async () => ({ settings: { enabled: mocks.enabled, disabledTools: mocks.disabledTools, confirmationOverrides: {} } }),
  maddoxToolMetas: async () => [
    { name: 'get_app_overview', group: 'context', label: 'Visão', description: '', risk: 'read', alwaysOn: true },
    { name: 'list_tasks', group: 'tasks', label: 'Listar tarefas', description: '', risk: 'read', alwaysOn: false },
  ],
}))
vi.mock('@/features/maddox-agent/server/client-config', () => ({ assertClientMaddoxToolAllowed: mocks.assertClientTool }))
vi.mock('@/features/opex-agent/server/tools/registry', () => ({
  OPEX_TOOLS: [
    { name: 'list_tasks', group: 'tasks', label: 'Listar tarefas', description: 'Lista as tarefas', risk: 'read', input: z.object({ search: z.string().optional() }), execute: mocks.executeOwner },
    { name: 'schedule_job', group: 'jobs', label: 'Agendar job', description: 'Agenda', risk: 'write', input: z.object({}), execute: vi.fn() },
  ],
}))
vi.mock('@/features/opex-agent/server/client-tools/registry', () => ({
  OPEX_CLIENT_SERVER_TOOLS: [{ name: 'list_tasks', group: 'tasks', label: 'Listar tarefas', description: 'Lista', risk: 'read', input: z.object({}), execute: mocks.executePortal }],
}))

import { callMaddoxTool, handleMaddoxMcpRequest, toolDescriptor } from '@/features/maddox-agent/server/mcp-server'
import { maddoxMcpSecret } from '@/features/maddox-agent/server/opencode-session'
import { OPENCODE_SESSION_META } from '@/features/maddox-agent/mcp-protocol'

const sessions = () => store.sessions as ReturnType<typeof memoryModel>
const meta = (id: string) => ({ [OPENCODE_SESSION_META]: id })
const textOf = (result: { content: { text: string }[] }) => result.content[0].text
const actor = { userId: 'u1', displayName: 'Ana', username: 'ana', email: null, client: { _id: 'c1', name: 'ACME' }, isAdmin: false, preview: false }

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.enabled = true
  mocks.disabledTools = []
  mocks.parentOf = {}
  sessions().docs.splice(0)
  await sessions().create({ title: 'Dono', agent: 'maddox', clientId: null, userId: 'local', opencodeSessionId: 'ses_owner' })
  await sessions().create({ title: 'Portal', agent: 'maddox', clientId: 'c1', userId: 'u1', opencodeSessionId: 'ses_portal' })
  await sessions().create({ title: 'Opex', agent: 'opex', clientId: null, userId: 'local', opencodeSessionId: 'ses_opex' })
  mocks.clientActorFor.mockResolvedValue(actor)
  mocks.assertClientTool.mockResolvedValue(actor)
})

describe('servidor MCP do Opex para o Maddox', () => {
  it('dono: executa a ferramenta real com a sessão do Maddox no contexto', async () => {
    const result = await callMaddoxTool('owner', 'list_tasks', { search: 'crm' }, meta('ses_owner'))
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(textOf(result))).toMatchObject({ ok: true, input: { search: 'crm' } })
    const context = mocks.executeOwner.mock.calls[0][1] as { sessionId: string; scope: { kind: string; agent: string } }
    expect(context.scope).toMatchObject({ kind: 'owner', agent: 'maddox' })
    expect(context.sessionId).toBe(String(sessions().docs[0]._id))
  })

  it('sessão do OpenCode que não é do Maddox (ou sem _meta) é recusada', async () => {
    expect((await callMaddoxTool('owner', 'list_tasks', {}, meta('ses_opex'))).isError).toBe(true)
    expect(textOf(await callMaddoxTool('owner', 'list_tasks', {}, {}))).toContain('Sessão do OpenCode não identificada')
    expect(mocks.executeOwner).not.toHaveBeenCalled()
  })

  it('subagente do OpenCode herda a sessão-mãe do Maddox', async () => {
    mocks.parentOf = { ses_child: 'ses_owner' }
    expect((await callMaddoxTool('owner', 'list_tasks', {}, meta('ses_child'))).isError).toBeUndefined()
  })

  it('escopo cruzado: sessão do portal no servidor do dono (e vice-versa) é recusada', async () => {
    expect(textOf(await callMaddoxTool('owner', 'list_tasks', {}, meta('ses_portal')))).toContain('fora do escopo')
    expect(textOf(await callMaddoxTool('portal', 'list_tasks', {}, meta('ses_owner')))).toContain('fora do escopo')
  })

  it('ferramenta desligada no meio da sessão é recusada na nova conferência', async () => {
    mocks.disabledTools = ['list_tasks']
    const result = await callMaddoxTool('owner', 'list_tasks', {}, meta('ses_owner'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('desligada')
  })

  it('jobs agendados ficam fora do catálogo do Maddox', async () => {
    expect(textOf(await callMaddoxTool('owner', 'schedule_job', {}, meta('ses_owner')))).toContain('Ferramenta desconhecida')
  })

  it('portal: revalida o ator antes de cada chamada; acesso perdido recusa', async () => {
    expect((await callMaddoxTool('portal', 'list_tasks', {}, meta('ses_portal'))).isError).toBeUndefined()
    expect(mocks.assertClientTool).toHaveBeenCalledWith('list_tasks', actor)
    mocks.assertClientTool.mockRejectedValueOnce(Object.assign(new Error('O Agente Maddox não está ativo para este cliente.'), {}))
    const denied = await callMaddoxTool('portal', 'list_tasks', {}, meta('ses_portal'))
    expect(denied.isError).toBe(true)
    expect(mocks.executePortal).toHaveBeenCalledTimes(1)
  })

  it('a rota exige o segredo derivado da chave das integrações', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const denied = await handleMaddoxMcpRequest('owner', new Request('http://x/api/maddox/mcp/owner', { method: 'POST', body, headers: { authorization: 'Bearer errado' } }))
    expect(denied.status).toBe(401)
    const ok = await handleMaddoxMcpRequest('owner', new Request('http://x/api/maddox/mcp/owner', { method: 'POST', body, headers: { authorization: `Bearer ${maddoxMcpSecret()}` } }))
    expect(ok.status).toBe(200)
    const json = (await ok.json()) as { result: { tools: { name: string }[] } }
    expect(json.result.tools.map((tool) => tool.name)).toEqual(['list_tasks'])
  })

  it('o descritor traz o esquema JSON da entrada e as dicas de risco', () => {
    const descriptor = toolDescriptor({ name: 'x', group: 'tasks', label: 'X', description: 'd', risk: 'destructive', input: z.object({ id: z.string() }), execute: async () => null })
    expect(descriptor.inputSchema).toMatchObject({ type: 'object', properties: { id: { type: 'string' } } })
    expect(descriptor.annotations).toEqual({ readOnlyHint: false, destructiveHint: true })
  })
})
