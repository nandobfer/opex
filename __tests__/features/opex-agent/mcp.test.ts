import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'

/**
 * MCPs do Agente Opex: módulo puro (nomes, risco, confirmação, schema), cadastro com segredos cifrados
 * e o carregamento das ferramentas no turno (com a `@ai-sdk/mcp` mockada — nunca rede real).
 */

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => {}),
  publishAppEvent: vi.fn(async () => {}),
  connectMcp: vi.fn(),
  clientConfig: vi.fn(async () => ({ enabled: true, disabledTools: [], enabledOptInTools: [], enabledMcpServers: [] as string[] })),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  updateManyClients: vi.fn(async () => ({})),
}))
const store = vi.hoisted(() => ({ servers: null as unknown }))

vi.mock('@/lib/db/models/Opex', () => {
  store.servers = memoryModel()
  return { OpexMcpServer: store.servers }
})
vi.mock('@/lib/db/models/Orcamento', () => ({
  OrcamentoClient: {
    find: () => ({ select: () => ({ lean: async () => [{ opexAgent: { enabledMcpServers: ['x'] } }] }) }),
    updateMany: mocks.updateManyClients,
  },
}))
vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => mocks.log, logger: mocks.log }))
vi.mock('@/features/opex-agent/server/client-config', () => ({ loadClientOpexConfig: mocks.clientConfig, setClientMcpAccess: vi.fn() }))
vi.mock('@/features/opex-agent/server/mcp/connect', async (original) => ({ ...(await original<object>()), connectMcp: mocks.connectMcp }))

import {
  cleanMcpInputSchema,
  defaultMcpToolConfirms,
  mcpToolConfirms,
  mcpToolName,
  mcpToolNames,
  mcpToolRisk,
  nextMcpConfirmations,
  opexMcpServerInputSchema,
  slugifyMcpName,
  type OpexMcpServerInput,
} from '@/features/opex-agent/mcp'
import { createMcpServer, deleteMcpServer, getMcpServer, listMcpServers, mcpConnectionOf, setMcpServerEnabled, testMcpConnection, updateMcpServer } from '@/features/opex-agent/server/mcp/service'
import { loadMcpTools, resolveMcpTool } from '@/features/opex-agent/server/mcp/tools'
import { buildToolRuntime } from '@/features/opex-agent/server/tool-runtime'
import { mcpTools } from '@/features/opex-agent/server/tools/mcp'
import type { MemoryModel } from '../../helpers/memory-model'

const servers = () => store.servers as MemoryModel
const KEY = Buffer.alloc(32, 7).toString('base64')

const input = (over: Partial<OpexMcpServerInput> = {}): OpexMcpServerInput =>
  opexMcpServerInputSchema.parse({
    name: 'GitHub',
    slug: 'github',
    description: '',
    enabled: true,
    transport: 'http',
    url: 'https://mcp.example.com/mcp?token=abc',
    command: '',
    args: [],
    headers: [{ key: 'Authorization', value: 'Bearer segredo' }],
    env: [],
    confirmations: {},
    ...over,
  })

type FakeTool = { name: string; description?: string; inputSchema: Record<string, unknown>; annotations?: Record<string, unknown> }
function fakeClient(tools: FakeTool[], call = vi.fn(async () => ({ content: [{ type: 'text', text: 'resultado' }] }))) {
  return { listTools: vi.fn(async () => ({ tools })), callTool: call, close: vi.fn(async () => {}), serverInfo: { name: 'gh', version: '1.0' } }
}

beforeEach(() => {
  vi.clearAllMocks()
  servers().docs.splice(0)
  process.env.INTEGRATIONS_ENCRYPTION_KEY = KEY
})

describe('MCPs — módulo puro', () => {
  it('nome da ferramenta: prefixo do MCP, só caracteres aceitos e até 64, sem colisão', () => {
    expect(mcpToolName('github', 'search.issues')).toBe('mcp_github_search_issues')
    const long = mcpToolName('github', 'x'.repeat(100))
    expect(long.length).toBe(64)
    expect(long.startsWith('mcp_github_x')).toBe(true)
    const names = mcpToolNames('gh', ['a.b', 'a_b'])
    expect(new Set(names.values()).size).toBe(2)
  })

  it('risco e confirmação padrão pela anotação; o ajuste da ferramenta vence e some quando volta ao padrão', () => {
    expect(mcpToolRisk({ readOnlyHint: true })).toBe('read')
    expect(mcpToolRisk({ destructiveHint: false })).toBe('write')
    expect(mcpToolRisk({})).toBe('destructive')
    expect(defaultMcpToolConfirms({ readOnlyHint: true })).toBe(false)
    expect(defaultMcpToolConfirms({})).toBe(true)
    const tool = { name: 'list', annotations: { readOnlyHint: true } }
    const custom = nextMcpConfirmations({}, tool, true)
    expect(custom).toEqual({ list: true })
    expect(mcpToolConfirms(tool, custom)).toBe(true)
    expect(nextMcpConfirmations(custom, tool, false)).toEqual({})
  })

  it('schema: URL obrigatória em HTTP/SSE, comando no stdio e nomes de segredo sem repetição', () => {
    expect(opexMcpServerInputSchema.safeParse({ ...input(), url: 'ftp://x' }).success).toBe(false)
    expect(opexMcpServerInputSchema.safeParse({ ...input(), transport: 'stdio', url: '', command: '' }).success).toBe(false)
    expect(opexMcpServerInputSchema.safeParse({ ...input(), transport: 'stdio', url: '', command: 'npx', headers: [] }).success).toBe(true)
    expect(opexMcpServerInputSchema.safeParse({ ...input(), headers: [{ key: 'A', value: '1' }, { key: 'A', value: '2' }] }).success).toBe(false)
    expect(slugifyMcpName('GitHub Ações!')).toBe('github_acoes')
  })

  it('JSON Schema do MCP vira objeto sem $schema', () => {
    expect(cleanMcpInputSchema({ $schema: 'x', type: 'object', properties: { q: { type: 'string', $id: 'q' } } })).toEqual({ type: 'object', properties: { q: { type: 'string' } } })
    expect(cleanMcpInputSchema(undefined)).toEqual({ type: 'object', properties: {} })
  })
})

describe('MCPs — cadastro', () => {
  it('cadastra cifrando os headers: o DTO só traz as chaves, a auditoria não tem segredo nem query da URL', async () => {
    const dto = await createMcpServer(input(), 'local')
    expect(dto.headers).toEqual([{ key: 'Authorization', configured: true }])
    expect(JSON.stringify(dto)).not.toContain('segredo')
    const stored = servers().docs[0]!
    expect(JSON.stringify(stored.headers)).not.toContain('segredo')
    expect(mcpConnectionOf(stored as never).headers).toEqual({ Authorization: 'Bearer segredo' })
    const audit = JSON.stringify(mocks.recordAudit.mock.calls)
    expect(audit).not.toContain('segredo')
    expect(audit).not.toContain('token=abc')
    expect(mocks.publishAppEvent).toHaveBeenCalledWith('opex-mcp-updated', { id: dto.id })
    expect((await listMcpServers())[0]!.clientCount).toBe(0)
  })

  it('editar com valor vazio mantém o segredo salvo; chave nova sem valor dá 400', async () => {
    const { id } = await createMcpServer(input(), 'local')
    await updateMcpServer(id, input({ name: 'GitHub 2', headers: [{ key: 'Authorization', value: '' }] }), 'local')
    expect(mcpConnectionOf(servers().docs[0] as never).headers).toEqual({ Authorization: 'Bearer segredo' })
    expect((await getMcpServer(id)).name).toBe('GitHub 2')
    await expect(updateMcpServer(id, input({ headers: [{ key: 'X-Novo', value: '' }] }), 'local')).rejects.toMatchObject({ status: 400, code: 'OPEX_MCP_SECRET_REQUIRED' })
  })

  it('identificador repetido dá 409 e sem a chave de criptografia gravar segredo dá 400', async () => {
    await createMcpServer(input(), 'local')
    await expect(createMcpServer(input({ name: 'Outro' }), 'local')).rejects.toMatchObject({ status: 409, code: 'OPEX_MCP_SLUG_TAKEN' })
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
    await expect(createMcpServer(input({ slug: 'outro' }), 'local')).rejects.toMatchObject({ status: 400, code: 'OPEX_MCP_ENCRYPTION_MISSING' })
  })

  it('habilitar/desabilitar sem excluir e excluir retira o MCP dos clientes', async () => {
    const { id } = await createMcpServer(input(), 'local')
    expect((await setMcpServerEnabled(id, false, 'local')).enabled).toBe(false)
    expect(servers().docs).toHaveLength(1)
    await deleteMcpServer(id, 'local')
    expect(servers().docs).toHaveLength(0)
    expect(mocks.updateManyClients).toHaveBeenCalledWith({ 'opexAgent.enabledMcpServers': id }, { $pull: { 'opexAgent.enabledMcpServers': id } })
  })

  it('testar conexão lista as ferramentas com as anotações; falha volta como erro sem lançar', async () => {
    mocks.connectMcp.mockResolvedValueOnce(fakeClient([{ name: 'search', description: 'Busca', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }]))
    const ok = await testMcpConnection({ ...input(), headers: [{ key: 'Authorization', value: 'x' }] })
    expect(ok).toMatchObject({ ok: true, serverInfo: 'gh 1.0', tools: [{ name: 'search', title: null, description: 'Busca', annotations: { readOnlyHint: true } }] })
    mocks.connectMcp.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    expect(await testMcpConnection({ ...input(), headers: [] })).toMatchObject({ ok: false, error: 'ECONNREFUSED', tools: [] })
  })
})

describe('MCPs — ferramentas no turno', () => {
  it('só os MCPs habilitados entram; a ferramenta chama o MCP, registra o log sem a entrada e o close fecha a conexão', async () => {
    const a = await createMcpServer(input({ confirmations: { search: true } }), 'local')
    await createMcpServer(input({ slug: 'desligado', enabled: false }), 'local')
    const client = fakeClient([{ name: 'search', inputSchema: { type: 'object', properties: { q: { type: 'string' } } }, annotations: { readOnlyHint: true } }])
    mocks.connectMcp.mockResolvedValue(client)

    const turn = await loadMcpTools({ kind: 'owner' })
    expect(turn.tools.map((tool) => tool.name)).toEqual(['mcp_github_search'])
    expect(turn.tools[0]).toMatchObject({ group: 'mcp', label: 'GitHub · search', risk: 'read', mcpServerId: a.id })
    expect(turn.overrides).toEqual({ mcp_github_search: true })
    expect(await turn.tools[0]!.execute({ q: 'bug' }, { sessionId: 's1', actorId: 'local' })).toBe('resultado')
    expect(client.callTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'search', arguments: { q: 'bug' } }))
    const logged = mocks.log.info.mock.calls.find((call) => call[1] === '[opex-mcp] chamada de ferramenta')!
    expect(logged[0]).toMatchObject({ mcp: 'github', tool: 'search', sessionId: 's1', ok: true })
    expect(JSON.stringify(logged[0])).not.toContain('bug')
    await turn.close()
    expect(client.close).toHaveBeenCalled()
  })

  it('a ferramenta do MCP pede confirmação conforme o ajuste do cadastro', async () => {
    await createMcpServer(input({ confirmations: { search: true } }), 'local')
    mocks.connectMcp.mockResolvedValue(fakeClient([{ name: 'search', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }]))
    const turn = await loadMcpTools({ kind: 'owner' })
    const requestConfirmation = vi.fn(async () => ({ actionId: 'a1', summary: 'Executar', status: 'pending' as const, error: null, expiresAt: '' }))
    const runtime = buildToolRuntime(turn.tools, { sessionId: 's1', actorId: 'local' }, turn.overrides, { requestConfirmation })
    const tool = runtime.tools.mcp_github_search as unknown as { execute: (input: unknown, options: { toolCallId: string }) => Promise<unknown> }
    expect(await tool.execute({}, { toolCallId: 't1' })).toMatchObject({ status: 'confirmation_required' })
    expect(requestConfirmation).toHaveBeenCalled()
  })

  it('MCP que não conecta fica de fora com aviso e erro gravado, sem derrubar os outros', async () => {
    await createMcpServer(input(), 'local')
    await createMcpServer(input({ name: 'Jira', slug: 'jira' }), 'local')
    // Os MCPs conectam na ordem do nome: GitHub responde, Jira não.
    mocks.connectMcp.mockResolvedValueOnce(fakeClient([{ name: 'ping', inputSchema: { type: 'object' } }])).mockRejectedValueOnce(new Error('Sem resposta em 10 s'))
    const turn = await loadMcpTools({ kind: 'owner' })
    expect(turn.tools.map((tool) => tool.name)).toEqual(['mcp_github_ping'])
    expect(turn.notices).toEqual([expect.stringContaining('MCP "Jira" indisponível neste turno (Sem resposta em 10 s)')])
    await vi.waitFor(() => expect(servers().docs.find((doc) => doc.slug === 'jira')!.lastError).toBe('Sem resposta em 10 s'))
    expect(mocks.log.warn).toHaveBeenCalledWith(expect.objectContaining({ mcp: 'jira' }), '[opex-mcp] MCP indisponível no turno')
  })

  it('erro devolvido pelo MCP vira erro da ferramenta com o nome do MCP', async () => {
    await createMcpServer(input(), 'local')
    mocks.connectMcp.mockResolvedValue(fakeClient([{ name: 'x', inputSchema: { type: 'object' } }], vi.fn(async () => ({ isError: true, content: [{ type: 'text', text: 'sem permissão' }] }))))
    const turn = await loadMcpTools({ kind: 'owner' })
    await expect(turn.tools[0]!.execute({}, { sessionId: 's1', actorId: 'local' })).rejects.toThrow('MCP GitHub: sem permissão')
  })

  it('portal: só os MCPs liberados ao cliente e habilitados', async () => {
    const a = await createMcpServer(input(), 'local')
    await createMcpServer(input({ name: 'Jira', slug: 'jira' }), 'local')
    mocks.connectMcp.mockImplementation(async () => fakeClient([{ name: 'ping', inputSchema: { type: 'object' } }]))
    mocks.clientConfig.mockResolvedValue({ enabled: true, disabledTools: [], enabledOptInTools: [], enabledMcpServers: [a.id] })
    const scope = { kind: 'client', actor: { client: { _id: 'c1' } } } as never
    expect((await loadMcpTools(scope)).tools.map((tool) => tool.name)).toEqual(['mcp_github_ping'])
    mocks.clientConfig.mockResolvedValue({ enabled: true, disabledTools: [], enabledOptInTools: [], enabledMcpServers: [] })
    expect((await loadMcpTools(scope)).tools).toEqual([])
  })

  it('ação confirmada depois do turno: reconecta só ao MCP da ferramenta; MCP desabilitado devolve null', async () => {
    const { id } = await createMcpServer(input(), 'local')
    mocks.connectMcp.mockResolvedValue(fakeClient([{ name: 'ping', inputSchema: { type: 'object' } }]))
    const resolved = await resolveMcpTool('mcp_github_ping', { kind: 'owner' })
    expect(resolved?.tool.name).toBe('mcp_github_ping')
    await resolved?.close()
    await setMcpServerEnabled(id, false, 'local')
    expect(await resolveMcpTool('mcp_github_ping', { kind: 'owner' })).toBeNull()
  })
})

describe('MCPs — ferramentas do Agente Opex para gerenciar MCPs', () => {
  const find = (name: string) => mcpTools.find((tool) => tool.name === name)!
  const ctx = { sessionId: 's1', actorId: 'local' }

  it('gravar, excluir e liberar MCP a cliente são destrutivas; ler e testar são leitura', () => {
    expect(Object.fromEntries(mcpTools.map((tool) => [tool.name, tool.risk]))).toMatchObject({
      list_mcp_servers: 'read',
      get_mcp_server: 'read',
      test_mcp_server: 'read',
      create_mcp_server: 'destructive',
      update_mcp_server: 'destructive',
      delete_mcp_server: 'destructive',
      set_client_mcp_access: 'destructive',
      set_mcp_server_enabled: 'write',
    })
  })

  it('create_mcp_server grava, testa a conexão e o redact tira os valores dos segredos', async () => {
    mocks.connectMcp.mockResolvedValue(fakeClient([{ name: 'ping', inputSchema: { type: 'object' } }]))
    const tool = find('create_mcp_server')
    const args = tool.input.parse({ name: 'GitHub', slug: 'github', transport: 'http', url: 'https://mcp.example.com/mcp', headers: [{ key: 'Authorization', value: 'Bearer segredo' }] })
    const out = (await tool.execute(args, ctx)) as { server: { headers: unknown; tools: unknown[] }; connection: { ok: boolean; tools: number } }
    expect(out.connection).toEqual({ ok: true, error: null, tools: 1 })
    expect(out.server.headers).toEqual([{ key: 'Authorization', configured: true }])
    expect(JSON.stringify(out)).not.toContain('segredo')
    expect(JSON.stringify(tool.redact!(args))).not.toContain('Bearer segredo')
  })

  it('update_mcp_server muda só o informado e mantém os segredos salvos', async () => {
    const { id } = await createMcpServer(input(), 'local')
    await find('update_mcp_server').execute(find('update_mcp_server').input.parse({ id, name: 'GH' }), ctx)
    expect((await getMcpServer(id)).name).toBe('GH')
    expect(mcpConnectionOf(servers().docs[0] as never).headers).toEqual({ Authorization: 'Bearer segredo' })
  })
})
