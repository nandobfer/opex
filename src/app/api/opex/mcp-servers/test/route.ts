import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { opexMcpTestInputSchema } from "@/features/opex-agent/mcp"
import { testMcpConnection } from "@/features/opex-agent/server/mcp/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/opex/mcp-servers/test — conecta ao rascunho e lista as ferramentas (não grava nada). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, opexMcpTestInputSchema)
    if (!body.ok) return body.response
    return ok(await testMcpConnection(body.data))
})
