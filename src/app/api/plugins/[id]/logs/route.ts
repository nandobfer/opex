import { ok } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { pluginClientErrorSchema, pluginLogsQuerySchema } from "@/features/plugins/schemas"
import { listPluginLogs, recordPluginClientError } from "@/features/plugins/server/logs"
import { findPlugin } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function requirePlugin(id: string) {
    const plugin = await findPlugin(id)
    if (!plugin) throw new DomainError(404, "Plugin não encontrado", "PLUGIN_NOT_FOUND")
    return plugin
}

/** GET /api/plugins/[id]/logs?after=&limit= — logs de debug do plugin (48 h), do mais antigo ao mais novo. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    await requirePlugin(params.id)
    const query = pluginLogsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!query.success) throw new DomainError(400, "Parâmetros inválidos", "VALIDATION_ERROR")
    return ok(await listPluginLogs(params.id, query.data))
})

/** POST /api/plugins/[id]/logs — erro de interface do plugin pego pela fronteira no navegador do dono. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    await requirePlugin(params.id)
    const body = await parseBody(req, pluginClientErrorSchema)
    if (!body.ok) return body.response
    recordPluginClientError(params.id, { message: body.data.message, stack: body.data.stack ?? null, channel: body.data.channel ?? null, where: body.data.where })
    return ok({ recorded: true })
})
