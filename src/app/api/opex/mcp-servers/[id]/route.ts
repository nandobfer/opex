import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { opexMcpEnabledSchema, opexMcpServerInputSchema } from "@/features/opex-agent/mcp"
import { deleteMcpServer, getMcpServer, setMcpServerEnabled, updateMcpServer } from "@/features/opex-agent/server/mcp/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/opex/mcp-servers/[id] — detalhe do MCP. */
export const GET = withRoute<Params>(async ({ params }) => ok(await getMcpServer(params.id)))

/** PUT …/[id] — edita o MCP (segredo vazio mantém o salvo). */
export const PUT = withRoute<Params>(async ({ req, params }) => {
    const body = await parseBody(req, opexMcpServerInputSchema)
    if (!body.ok) return body.response
    return ok(await updateMcpServer(params.id, body.data, getLocalUser().id))
})

/** PATCH …/[id] — `{ enabled }`: habilita ou desabilita sem excluir. */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    const body = await parseBody(req, opexMcpEnabledSchema)
    if (!body.ok) return body.response
    return ok(await setMcpServerEnabled(params.id, body.data.enabled, getLocalUser().id))
})

/** DELETE …/[id] — exclui o MCP e o retira dos clientes. */
export const DELETE = withRoute<Params>(async ({ params }) => ok(await deleteMcpServer(params.id, getLocalUser().id)))
