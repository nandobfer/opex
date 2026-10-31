import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/**
 * MCP do dono por token de sistema (OPE-102): `tools/list` filtrado pelos escopos, `tools/call`
 * permitido como dono e sem sessão, ferramenta fora do escopo, destrutiva sem o escopo dedicado,
 * portal recusado e o segredo interno do OpenCode intacto.
 */

const mocks = vi.hoisted(() => ({
  enabled: true,
  disabledTools: [] as string[],
  token: null as null | Record<string, unknown>,
  execute: vi.fn(async (input: unknown) => ({ ok: true, input })),
  warn: vi.fn(),
  info: vi.fn(),
}))

process.env.INTEGRATIONS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')

const TOOLS = [
  { name: 'get_app_overview', group: 'context', label: 'Visão', description: 'Visão', risk: 'read' },
  { name: 'list_tasks', group: 'tasks', label: 'Listar tarefas', description: 'Lista', risk: 'read' },
  { name: 'delete_task', group: 'tasks', label: 'Excluir tarefa', description: 'Exclui', risk: 'destructive' },
  { name: 'write_file', group: 'github', label: 'Gravar arquivo', description: 'Grava', risk: 'write', confirmByDefault: true },
  { name: 'list_chat_files', group: 'files', label: 'Arquivos do chat', description: 'Arquivos', risk: 'read' },
] as const

vi.mock('@/lib/db', () => ({ dbConnect: async () => {} }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: mocks.info, warn: mocks.warn }) }))
vi.mock('@/lib/db/models/Opex', () => ({ OpexSession: { findOne: () => ({ lean: async () => null }) } }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: async () => ({ session: { get: async () => null } }) }))
vi.mock('@/features/auth/server/context', () => ({ clientActorFor: vi.fn() }))
vi.mock('@/features/maddox-agent/server/client-config', () => ({ assertClientMaddoxToolAllowed: vi.fn() }))
vi.mock('@/features/integrations/api-tokens/service', () => ({
  API_TOKEN_PREFIX: 'mt_sys_',
  authenticateApiToken: async (authorization: string | null) => (authorization === 'Bearer mt_sys_valido' ? mocks.token : null),
  tokenLogRef: (token: { id: string; nome: string; prefixo: string }) => ({ tokenId: token.id, tokenNome: token.nome, tokenPrefixo: token.prefixo }),
}))
vi.mock('@/features/maddox-agent/server/settings', () => ({
  loadMaddoxSettings: async () => ({ settings: { enabled: mocks.enabled, disabledTools: mocks.disabledTools, confirmationOverrides: {} } }),
  maddoxToolMetas: async () => TOOLS.map((tool) => ({ ...tool, alwaysOn: tool.group === 'context' })),
}))
vi.mock('@/features/opex-agent/server/tools/registry', () => ({
  OPEX_TOOLS: [
    ...TOOLS.map((tool) => ({ ...tool, input: z.object({ id: z.string().optional() }), execute: mocks.execute })),
    { name: 'schedule_job', group: 'jobs', label: 'Agendar', description: 'Agenda', risk: 'write', input: z.object({}), execute: vi.fn() },
  ],
}))
vi.mock('@/features/opex-agent/server/client-tools/registry', () => ({ OPEX_CLIENT_SERVER_TOOLS: [] }))

import { callMaddoxToolAsToken, handleMaddoxMcpRequest } from '@/features/maddox-agent/server/mcp-server'
import { maddoxMcpSecret } from '@/features/maddox-agent/server/opencode-session'
import { MADDOX_MCP_REFUSALS } from '@/features/maddox-agent/mcp-protocol'
import type { ApiTokenDto } from '@/features/integrations/api-tokens/types'

const tokenWith = (escopos: string[]): ApiTokenDto => ({ id: 't1', nome: 'Automação', prefixo: 'mt_sys_AbCdEfGh', criadoEm: '', ultimoUsoEm: null, escopos, legado: escopos.length === 0, expiraEm: null, expirado: false })

const rpc = (scope: 'owner' | 'portal', body: unknown, authorization = 'Bearer mt_sys_valido') =>
  handleMaddoxMcpRequest(scope, new Request(`http://x/api/maddox/mcp/${scope}`, { method: 'POST', body: JSON.stringify(body), headers: { authorization } }))

const listNames = async (scopes: string[]) => {
  mocks.token = tokenWith(scopes)
  const res = await rpc('owner', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
  expect(res.status).toBe(200)
  return ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name)
}

const textOf = (result: { content: { text: string }[] }) => result.content[0]!.text

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled = true
  mocks.disabledTools = []
  mocks.token = null
})

describe('MCP do dono por token de sistema', () => {
  it('tools/list devolve só as ferramentas do token (Contexto sempre; destrutivas só com o escopo dedicado; arquivos do chat nunca)', async () => {
    expect(await listNames(['mcp:owner', 'mcp:owner:tool:list_tasks'])).toEqual(['get_app_overview', 'list_tasks'])
    expect(await listNames(['mcp:owner', 'mcp:owner:group:tasks'])).toEqual(['get_app_overview', 'list_tasks'])
    expect(await listNames(['mcp:owner', 'mcp:owner:tool:*'])).toEqual(['get_app_overview', 'list_tasks'])
    expect(await listNames(['mcp:owner', 'mcp:owner:tool:*', 'mcp:owner:destructive'])).toEqual(['get_app_overview', 'list_tasks', 'delete_task', 'write_file'])
  })

  it('tools/list respeita a configuração do Maddox (ferramenta desligada some; agente desativado = vazio)', async () => {
    mocks.disabledTools = ['list_tasks']
    expect(await listNames(['mcp:owner', 'mcp:owner:tool:*'])).toEqual(['get_app_overview'])
    mocks.enabled = false
    expect(await listNames(['mcp:owner', 'mcp:owner:tool:*'])).toEqual([])
  })

  it('tools/call permitida executa como dono, sem sessão do OpenCode e com a origem do token', async () => {
    mocks.token = tokenWith(['mcp:owner', 'mcp:owner:tool:list_tasks'])
    const res = await rpc('owner', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_tasks', arguments: { id: 'x' } } })
    const body = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } }
    expect(body.result.isError).toBeUndefined()
    expect(JSON.parse(textOf(body.result))).toMatchObject({ ok: true, input: { id: 'x' } })
    const context = mocks.execute.mock.calls[0]![1] as Record<string, unknown>
    expect(context).toMatchObject({ sessionId: '', actorId: 'local', scope: { kind: 'owner', agent: 'maddox' }, origin: { kind: 'api-token', tokenId: 't1', nome: 'Automação', prefixo: 'mt_sys_AbCdEfGh' } })
  })

  it('ferramenta fora do escopo é recusada com isError e log do token, sem executar', async () => {
    const result = await callMaddoxToolAsToken(tokenWith(['mcp:owner', 'mcp:owner:tool:list_tasks']), 'write_file', {})
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe(MADDOX_MCP_REFUSALS.tokenScope('write_file'))
    expect(mocks.execute).not.toHaveBeenCalled()
    const logged = JSON.stringify(mocks.warn.mock.calls)
    expect(logged).toContain('mt_sys_AbCdEfGh')
    expect(logged).toContain('not_granted')
  })

  it('destrutiva (ou com confirmação padrão) sem mcp:owner:destructive é recusada mesmo com curinga; com o escopo, executa', async () => {
    for (const name of ['delete_task', 'write_file']) {
      const denied = await callMaddoxToolAsToken(tokenWith(['mcp:owner', 'mcp:owner:tool:*']), name, {})
      expect(denied.isError).toBe(true)
      expect(textOf(denied)).toBe(MADDOX_MCP_REFUSALS.tokenDestructive(name))
    }
    expect(mocks.execute).not.toHaveBeenCalled()
    const allowed = await callMaddoxToolAsToken(tokenWith(['mcp:owner', 'mcp:owner:tool:delete_task', 'mcp:owner:destructive']), 'delete_task', { id: 't' })
    expect(allowed.isError).toBeUndefined()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })

  it('arquivos do chat e jobs não são executáveis por token', async () => {
    expect(textOf(await callMaddoxToolAsToken(tokenWith(['mcp:owner', 'mcp:owner:tool:*']), 'list_chat_files', {}))).toBe(MADDOX_MCP_REFUSALS.tokenNotGrantable('list_chat_files'))
    expect(textOf(await callMaddoxToolAsToken(tokenWith(['mcp:owner', 'mcp:owner:tool:*']), 'schedule_job', {}))).toContain('Ferramenta desconhecida')
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('revalida a configuração do Maddox a cada chamada (desativado ou ferramenta desligada)', async () => {
    mocks.enabled = false
    expect(textOf(await callMaddoxToolAsToken(tokenWith(['mcp:owner', 'mcp:owner:tool:*']), 'list_tasks', {}))).toBe(MADDOX_MCP_REFUSALS.disabled)
    mocks.enabled = true
    mocks.disabledTools = ['list_tasks']
    expect(textOf(await callMaddoxToolAsToken(tokenWith(['mcp:owner', 'mcp:owner:tool:*']), 'list_tasks', {}))).toContain(MADDOX_MCP_REFUSALS.toolDisabled)
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('token só de API (sem mcp:owner) recebe 403; token inválido 401; portal recusa token com 403', async () => {
    mocks.token = tokenWith(['api:v1:*'])
    const noMcp = await rpc('owner', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(noMcp.status).toBe(403)
    expect(((await noMcp.json()) as { error: { message: string } }).error.message).toBe(MADDOX_MCP_REFUSALS.tokenNoMcp)
    mocks.token = tokenWith([])
    expect((await rpc('owner', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status).toBe(403)

    const invalid = await rpc('owner', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'Bearer mt_sys_revogado')
    expect(invalid.status).toBe(401)

    mocks.token = tokenWith(['mcp:owner', 'mcp:owner:tool:*'])
    const portal = await rpc('portal', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(portal.status).toBe(403)
    expect(((await portal.json()) as { error: { message: string } }).error.message).toBe(MADDOX_MCP_REFUSALS.tokenPortal)
  })

  it('o segredo interno do OpenCode continua funcionando (catálogo inteiro, sem filtro de token)', async () => {
    const res = await rpc('owner', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, `Bearer ${maddoxMcpSecret()}`)
    expect(res.status).toBe(200)
    const names = ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name)
    expect(names).toEqual(['get_app_overview', 'list_tasks', 'delete_task', 'write_file', 'list_chat_files'])
  })
})
