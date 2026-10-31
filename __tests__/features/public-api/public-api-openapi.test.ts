import { existsSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { parseOpenApiSpec } from '@/features/integrations/openapi/parser'
import { findSpecUrlCandidates } from '@/features/integrations/openapi/spec-source'
import { buildPublicApiSpec, insufficientScopeResponse, PUBLIC_TOKEN_ROUTES, SECURITY_SCHEMES, tokenOperationSecurity } from '@/features/public-api/openapi/spec'
import { publicRouteScope } from '@/features/public-api/routes'
import { whoAmIResponseSchema } from '@/features/public-api/schemas'
import { renderPublicApiDocsHtml } from '@/features/public-api/openapi/docs-page'
import { GET as getSpec } from '@/app/api/openapi.json/route'

// O catálogo do MCP do Agente Maddox é coberto em maddox-mcp-spec.test.ts; aqui, a rota sem ele.
vi.mock('@/features/maddox-agent/server/mcp-catalog', () => ({ maddoxMcpDocsCatalog: async () => { throw new Error('fora deste teste') } }))
import { GET as getDocs } from '@/app/api/docs/route'
import { getIntegrationDef } from '@/lib/integrations/catalog'
import { PUBLIC_API_SPEC_PATH } from '@/lib/public-api/paths'
import packageJson from '../../../package.json'

/**
 * Documentação OpenAPI da API interna: especificação válida para o explorador, cobertura de
 * todas as rotas públicas por token e páginas públicas.
 */

type RawSpec = {
  paths: Record<string, Record<string, { security?: unknown; responses: object }>>
  components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> }
}

describe('buildPublicApiSpec', () => {
  it('é OpenAPI 3.1 aceito pelo explorador, com a versão do package.json', () => {
    const spec = parseOpenApiSpec(buildPublicApiSpec())
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.info).toMatchObject({ title: 'API interna do Opex', version: packageJson.version })
    expect(spec.servers).toEqual(['/'])
    expect(spec.operations.map((op) => op.key)).toEqual(['GET /api/v1/whoami'])
  })

  it('a versão pode ser sobrescrita', () => {
    expect((buildPublicApiSpec({ version: '9.9.9' }) as { info: { version: string } }).info.version).toBe('9.9.9')
  })

  it('/api/v1/whoami exige o token de sistema e documenta 200/401', () => {
    const raw = buildPublicApiSpec() as RawSpec
    const op = raw.paths['/api/v1/whoami']!.get!
    expect(op.security).toEqual([{ [SECURITY_SCHEMES.apiToken]: [] }])
    expect(Object.keys(op.responses).sort()).toEqual(['200', '401'])
    expect(raw.components.securitySchemes.apiToken).toMatchObject({ type: 'http', scheme: 'bearer' })
    expect(Object.keys(raw.components.schemas)).toEqual(expect.arrayContaining(['WhoAmIResponse', 'ApiError']))
  })

  it('toda rota pública por token está documentada e existe no app', () => {
    expect(PUBLIC_TOKEN_ROUTES).toEqual([{ method: 'GET', path: '/api/v1/whoami', scope: null, summary: 'Confere o token' }])
    const paths = Object.keys((buildPublicApiSpec() as RawSpec).paths)
    for (const route of PUBLIC_TOKEN_ROUTES) {
      expect(paths).toContain(route.path)
      expect(existsSync(join(process.cwd(), 'src/app', route.path, 'route.ts')), route.path).toBe(true)
    }
  })

  it('o esquema apiToken traz o catálogo de escopos e cada operação o escopo exigido', () => {
    const raw = buildPublicApiSpec() as RawSpec & { paths: Record<string, Record<string, Record<string, unknown>>> }
    const description = (raw.components.securitySchemes.apiToken as { description: string }).description
    for (const scope of ['api:v1:*', 'mcp:owner', 'mcp:owner:tool:*', 'mcp:owner:group:<grupo>', 'mcp:owner:tool:<nome>', 'mcp:owner:destructive']) expect(description).toContain(`\`${scope}\``)
    const whoami = raw.paths['/api/v1/whoami']!.get!
    expect(whoami['x-opex-required-scope']).toBeNull()
    expect(String(whoami.description)).toContain('qualquer token válido')
    for (const route of PUBLIC_TOKEN_ROUTES) {
      const op = raw.paths[route.path]![route.method.toLowerCase()]!
      expect(op['x-opex-required-scope']).toBe(route.scope)
      // 403 só onde pode acontecer: rota com escopo.
      expect(Object.keys(op.responses as object).includes('403')).toBe(route.scope !== null)
    }
  })

  it('rota com escopo documenta o papel no security e o 403 INSUFFICIENT_SCOPE', () => {
    expect(tokenOperationSecurity('api:v1:relatorios')).toEqual({ security: [{ apiToken: ['api:v1:relatorios'] }], 'x-opex-required-scope': 'api:v1:relatorios' })
    expect(tokenOperationSecurity(null)).toEqual({ security: [{ apiToken: [] }], 'x-opex-required-scope': null })
    expect(insufficientScopeResponse('api:v1:relatorios').content['application/json'].example).toMatchObject({ code: 'INSUFFICIENT_SCOPE', details: { required: 'api:v1:relatorios' } })
  })

  it('o exemplo do whoami valida no schema da rota (com escopos e expiração)', () => {
    const raw = buildPublicApiSpec() as unknown as { paths: Record<string, { get: { responses: { '200': { content: { 'application/json': { example: { data: unknown } } } } } } }> }
    const example = raw.paths['/api/v1/whoami']!.get.responses['200'].content['application/json'].example
    expect(whoAmIResponseSchema.safeParse(example.data).success).toBe(true)
    expect(publicRouteScope('/api/v1/whoami')).toBeNull()
  })

  it('não documenta rotinas/crons', () => {
    const paths = Object.keys((buildPublicApiSpec() as RawSpec).paths)
    expect(paths.some((p) => p.startsWith('/api/routines'))).toBe(false)
  })
})

describe('rotas públicas da documentação', () => {
  it('GET /api/openapi.json devolve a especificação com cache público', async () => {
    const res = await getSpec()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('public')
    const body = await res.json()
    expect(body.openapi).toBe('3.1.0')
  })

  it('GET /api/docs devolve o Swagger UI apontando para a especificação', async () => {
    const res = getDocs()
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(findSpecUrlCandidates(html, 'https://app.exemplo.com/api/docs')).toContain(
      'https://app.exemplo.com/api/openapi.json',
    )
  })

  it('escapa o caminho da especificação no HTML', () => {
    const html = renderPublicApiDocsHtml('/x"</script><b>')
    expect(html).not.toContain('</script><b>')
    expect(html.match(/<\/script>/g)).toHaveLength(2)
  })

  it('a integração API interna usa a especificação como documentação gerenciada', () => {
    expect(getIntegrationDef('internal_api').managedSwaggerPath).toBe(PUBLIC_API_SPEC_PATH)
  })
})
