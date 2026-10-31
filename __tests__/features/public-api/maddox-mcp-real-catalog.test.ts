import { describe, expect, it } from 'vitest'

/**
 * Catálogo REAL do MCP do Agente Maddox na especificação: o explorador aceita, nenhuma ferramenta de
 * jobs entra e o exemplo de `tools/call` de cada ferramenta valida no Zod dela.
 */

import { maddoxMcpCatalog, maddoxMcpDocsCatalog } from '@/features/maddox-agent/server/mcp-catalog'
import { buildPublicApiSpec } from '@/features/public-api/openapi/spec'
import { parseOpenApiSpec } from '@/features/integrations/openapi/parser'

type Examples = Record<string, { value: { params?: { name: string; arguments: unknown } } }>
type Raw = { paths: Record<string, { post: { requestBody: { content: { 'application/json': { examples: Examples } } } } }> }

describe('catálogo real do MCP do Agente Maddox', () => {
  it('a especificação completa é aceita pelo explorador e os exemplos validam em cada ferramenta', async () => {
    const catalog = await maddoxMcpDocsCatalog()
    expect(catalog.owner.length).toBeGreaterThan(20)
    expect(catalog.portal.length).toBeGreaterThan(5)
    const raw = buildPublicApiSpec({ maddoxTools: catalog }) as unknown as Raw
    expect(parseOpenApiSpec(raw).operations.map((op) => op.key)).toEqual(expect.arrayContaining(['POST /api/maddox/mcp/owner', 'POST /api/maddox/mcp/portal']))
    const invalid: string[] = []
    for (const scope of ['owner', 'portal'] as const) {
      const tools = await maddoxMcpCatalog(scope)
      expect(tools.some((tool) => tool.group === 'jobs')).toBe(false)
      const examples = raw.paths[`/api/maddox/mcp/${scope}`]!.post.requestBody.content['application/json'].examples
      for (const tool of tools) {
        const args = examples[`call-${tool.name}`]!.value.params!.arguments
        if (!tool.input.safeParse(args).success) invalid.push(`${scope}:${tool.name}`)
      }
    }
    expect(invalid).toEqual([])
  }, 30_000)
})
