import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { opexMcpServerInputSchema } from "@/features/opex-agent/mcp"
import { createMcpServer, listMcpServers } from "@/features/opex-agent/server/mcp/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/mcp-servers — MCPs do Agente Opex (segredos só pelas chaves). */
export const GET = withRoute(async () => ok(await listMcpServers()))

/** POST /api/opex/mcp-servers — cadastra um MCP (auditado). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, opexMcpServerInputSchema)
    if (!body.ok) return body.response
    return created(await createMcpServer(body.data, getLocalUser().id))
})
