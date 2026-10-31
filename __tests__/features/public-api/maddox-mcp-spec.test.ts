import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/**
 * Documentação do MCP do Agente Maddox na API interna: gerada do mesmo catálogo do `tools/list`
 * (registros simulados), jobs fora, exemplos válidos, rota com import dinâmico e queda segura.
 */

const secretTool = {
  name: 'update_integration',
  group: 'integrations',
  label: 'Configurar integração',
  description: 'Grava campos | de uma integração',
  risk: 'destructive',
  input: z.object({ id: z.enum(['github', 'pusher']), values: z.record(z.string(), z.string()) }),
  redact: () => ({}),
  execute: async () => null,
}
const listTool = { name: 'list_tasks', group: 'tasks', label: 'Listar tarefas', description: 'Lista tarefas', risk: 'read', input: z.object({ limit: z.number().int().min(1).default(20), search: z.string().optional() }), execute: async () => null }
const jobTool = { name: 'schedule_job', group: 'jobs', label: 'Agendar', description: 'Agenda', risk: 'write', input: z.object({ title: z.string() }), execute: async () => null }
const portalAdminTool = { name: 'list_client_users', group: 'users', label: 'Usuários', description: 'Usuários do cliente', risk: 'read', adminOnly: true, input: z.object({ taskId: z.string().regex(/^[a-f0-9]{24}$/i) }), execute: async () => null }
const portalContext = { name: 'get_portal_overview', group: 'context', label: 'Visão', description: 'Visão do portal', risk: 'read', input: z.object({}), execute: async () => null }
const portalJob = { name: 'schedule_job', group: 'jobs', label: 'Agendar', description: 'Agenda', risk: 'write', input: z.object({ title: z.string() }), execute: async () => null }

vi.mock('@/features/opex-agent/server/tools/registry', () => ({ OPEX_TOOLS: [listTool, secretTool, jobTool] }))
vi.mock('@/features/opex-agent/server/client-tools/registry', () => ({ OPEX_CLIENT_SERVER_TOOLS: [portalContext, portalAdminTool, portalJob] }))
vi.mock('@/features/maddox-agent/catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/maddox-agent/catalog')>()
  return { ...actual, MADDOX_CLIENT_TOOL_NAMES: ['get_portal_overview', 'list_client_users'] }
})

import { maddoxMcpCatalog, maddoxMcpDocsCatalog, toolDescriptor } from '@/features/maddox-agent/server/mcp-catalog'
import type { OpexTool } from '@/features/opex-agent/server/tools/define'
import { buildPublicApiSpec } from '@/features/public-api/openapi/spec'
import { MADDOX_MCP_SECURITY_SCHEME, MADDOX_MCP_TAGS, maddoxToolSchemaName } from '@/features/public-api/openapi/maddox-mcp'
import { exampleFromJsonSchema } from '@/features/public-api/openapi/json-schema-example'
import { parseOpenApiSpec } from '@/features/integrations/openapi/parser'
import { MADDOX_MCP_REFUSALS } from '@/features/maddox-agent/mcp-protocol'

type Op = { tags: string[]; security: unknown; description: string; requestBody: { content: Record<string, { schema: unknown; examples: Record<string, { value: { method: string; params?: { name: string; arguments: unknown } } }> }> }; responses: Record<string, { content?: Record<string, { examples: Record<string, { value: unknown }> }> }> }
type Raw = { paths: Record<string, Record<string, Op>>; components: { schemas: Record<string, Record<string, unknown>>; securitySchemes: Record<string, unknown> }; tags: { name: string }[] }


describe('catálogo do MCP do Agente Maddox', () => {
  it('é o mesmo do tools/list: dono sem jobs; portal só com as ferramentas do Maddox', async () => {
    expect((await maddoxMcpCatalog('owner')).map((tool) => tool.name)).toEqual(['list_tasks', 'update_integration'])
    expect((await maddoxMcpCatalog('portal')).map((tool) => tool.name)).toEqual(['get_portal_overview', 'list_client_users'])
  })

  it('documenta nome no OpenCode, grupo, risco, confirmação e admin; o esquema é idêntico ao do tools/list', async () => {
    const catalog = await maddoxMcpDocsCatalog()
    const secret = catalog.owner.find((tool) => tool.name === 'update_integration')!
    expect(secret).toMatchObject({ opencodeName: 'opex_app_update_integration', groupLabel: 'Integrações', risk: 'destructive', confirmsByDefault: true, adminOnly: false })
    expect(secret.inputSchema).toEqual(toolDescriptor(secretTool as unknown as OpexTool).inputSchema)
    expect(catalog.portal.find((tool) => tool.name === 'list_client_users')).toMatchObject({ opencodeName: 'opex_portal_list_client_users', adminOnly: true, confirmsByDefault: false })
  })
})

describe('seção MCP da especificação', () => {
  it('dois servidores com o segredo do MCP, as respostas documentadas e o explorador aceitando a especificação', async () => {
    const raw = buildPublicApiSpec({ maddoxTools: await maddoxMcpDocsCatalog() }) as unknown as Raw
    for (const [path, scope] of [['/api/maddox/mcp/owner', 'owner'], ['/api/maddox/mcp/portal', 'portal']] as const) {
      const op = raw.paths[path]!.post!
      expect(op.tags).toEqual([MADDOX_MCP_TAGS[scope]])
      expect(op.security).toEqual([{ [MADDOX_MCP_SECURITY_SCHEME]: [] }])
      expect(Object.keys(op.responses)).toEqual(['200', '202', '400', '401', '404'])
      expect(raw.paths[path]!.get!.responses).toHaveProperty('405')
    }
    expect(raw.components.securitySchemes[MADDOX_MCP_SECURITY_SCHEME]).toMatchObject({ type: 'http', scheme: 'bearer' })
    const parsed = parseOpenApiSpec(raw)
    expect(parsed.operations.map((op) => op.key)).toContain('POST /api/maddox/mcp/owner')
    expect(parsed.tags.map((tag) => tag.name)).toEqual(expect.arrayContaining([MADDOX_MCP_TAGS.owner, MADDOX_MCP_TAGS.portal]))
  })

  it('cada ferramenta aparece na lista da operação, no oneOf do tools/call, nos exemplos e em Schemas; jobs não', async () => {
    const catalog = await maddoxMcpDocsCatalog()
    const raw = buildPublicApiSpec({ maddoxTools: catalog }) as unknown as Raw
    const op = raw.paths['/api/maddox/mcp/owner']!.post!
    const call = raw.components.schemas['McpToolsCall.owner']!.properties as { params: { oneOf: { $ref: string }[]; discriminator: { mapping: Record<string, string> } } }
    for (const tool of catalog.owner) {
      expect(op.description).toContain(`• ${tool.opencodeName} (${tool.name})`)
      expect(Object.keys(call.params.discriminator.mapping)).toContain(tool.name)
      expect(raw.components.schemas[maddoxToolSchemaName('owner', tool.name)]).toMatchObject({ ...tool.inputSchema, title: tool.title })
      expect(op.requestBody.content['application/json']!.examples[`call-${tool.name}`]!.value.params!.name).toBe(tool.name)
    }
    expect(call.params.oneOf).toHaveLength(2)
    const json = JSON.stringify(raw)
    expect(json).not.toContain('schedule_job"')
    expect(op.description).toContain('[Integrações · destrutiva · pede confirmação]')
    expect(raw.paths['/api/maddox/mcp/portal']!.post!.description).toContain('só admin')
  })

  it('exemplos de tools/call trazem argumentos que validam no Zod da ferramenta e a sessão do OpenCode', async () => {
    const raw = buildPublicApiSpec({ maddoxTools: await maddoxMcpDocsCatalog() }) as unknown as Raw
    const examples = raw.paths['/api/maddox/mcp/owner']!.post!.requestBody.content['application/json']!.examples
    // Só os campos obrigatórios: o exemplo mínimo que valida.
    expect(examples['call-list_tasks']!.value.params).toMatchObject({ arguments: {}, _meta: { 'ai.opencode/sessionID': expect.stringMatching(/^ses_/) } })
    expect(listTool.input.safeParse(examples['call-list_tasks']!.value.params!.arguments).success).toBe(true)
    expect(secretTool.input.safeParse(examples['call-update_integration']!.value.params!.arguments).success).toBe(true)
    const portal = raw.paths['/api/maddox/mcp/portal']!.post!.requestBody.content['application/json']!.examples
    expect(portalAdminTool.input.safeParse(portal['call-list_client_users']!.value.params!.arguments).success).toBe(true)
  })

  it('as recusas documentadas são as mensagens reais do servidor', async () => {
    const raw = buildPublicApiSpec({ maddoxTools: await maddoxMcpDocsCatalog() }) as unknown as Raw
    const text = JSON.stringify(raw.paths['/api/maddox/mcp/portal']!.post!.responses['200']!.content)
    for (const message of [MADDOX_MCP_REFUSALS.noSession, MADDOX_MCP_REFUSALS.notMaddox, MADDOX_MCP_REFUSALS.wrongScope, MADDOX_MCP_REFUSALS.disabled, MADDOX_MCP_REFUSALS.toolDisabled]) expect(text).toContain(JSON.stringify(message).slice(1, -1))
  })

  it('sem catálogo, a especificação continua só com as rotas por token', () => {
    const raw = buildPublicApiSpec() as unknown as Raw
    expect(Object.keys(raw.paths)).toEqual(['/api/v1/whoami'])
    expect(raw.components.securitySchemes).not.toHaveProperty(MADDOX_MCP_SECURITY_SCHEME)
  })
})

describe('GET /api/openapi.json', () => {
  it('inclui o MCP do Agente Maddox', async () => {
    const { GET } = await import('@/app/api/openapi.json/route')
    const body = (await (await GET()).json()) as Raw
    expect(Object.keys(body.paths)).toEqual(['/api/v1/whoami', '/api/maddox/mcp/owner', '/api/maddox/mcp/portal'])
  })

  it('catálogo indisponível: responde a especificação sem o MCP', async () => {
    vi.resetModules()
    vi.doMock('@/features/maddox-agent/server/mcp-catalog', () => ({ maddoxMcpDocsCatalog: async () => { throw new Error('registro quebrado') } }))
    const { GET } = await import('@/app/api/openapi.json/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(Object.keys(((await res.json()) as Raw).paths)).toEqual(['/api/v1/whoami'])
    vi.doUnmock('@/features/maddox-agent/server/mcp-catalog')
  })

  it('o registro de ferramentas não entra no grafo estático da rota nem da especificação', () => {
    const forbidden = /^import (?!type )[^\n]*from "(@\/features\/opex-agent\/server\/(tools\/registry|client-tools\/registry|tool-runtime)|@\/features\/maddox-agent\/server\/(mcp-server|mcp-catalog))"/m
    for (const file of ['src/app/api/openapi.json/route.ts', 'src/features/public-api/openapi/spec.ts', 'src/features/public-api/openapi/maddox-mcp.ts']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(forbidden)
    }
  })
})

describe('exemplo a partir do JSON Schema', () => {
  it('default, enum, const e modelos por tipo; só os campos obrigatórios', () => {
    expect(exampleFromJsonSchema({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'integer', minimum: 3 }, c: { type: 'boolean' } }, required: ['a', 'b'] })).toEqual({ a: 'texto', b: 3 })
    expect(exampleFromJsonSchema({ type: 'string', enum: ['x', 'y'] })).toBe('x')
    expect(exampleFromJsonSchema({ type: 'number', default: 7 })).toBe(7)
    expect(exampleFromJsonSchema({ const: 'fixo' })).toBe('fixo')
    expect(exampleFromJsonSchema({ type: 'array', items: { type: 'string' }, minItems: 2 })).toEqual(['texto', 'texto'])
    expect(exampleFromJsonSchema({ anyOf: [{ type: 'null' }, { type: 'string', format: 'date' }] })).toBe('2026-01-31')
    expect(exampleFromJsonSchema({ type: 'string', pattern: '^[a-f0-9]{24}$' })).toBe('66f0c0ffee0000000000abcd')
    expect(exampleFromJsonSchema({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })).toBe('2026-01-31')
    expect(exampleFromJsonSchema({ type: 'string', examples: ['global'] })).toBe('global')
    expect(exampleFromJsonSchema(null)).toBeNull()
  })
})
