import { ok } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { pluginClientErrorSchema } from "@/features/plugins/schemas"
import { recordPluginClientError } from "@/features/plugins/server/logs"
import { findPlugin } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/cliente/plugins/[id]/logs — erro de interface de um plugin do portal (qualquer usuário do
 * cliente que o viu quebrar). Só grava para plugin do próprio cliente; quem lê é o dono, no debug.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    const plugin = await findPlugin(params.id)
    if (!plugin || plugin.scope !== "client" || plugin.clientId !== String(actor.client._id)) throw new DomainError(404, "Plugin não encontrado", "PLUGIN_NOT_FOUND")
    const body = await parseBody(req, pluginClientErrorSchema)
    if (!body.ok) return body.response
    recordPluginClientError(params.id, { message: body.data.message, stack: body.data.stack ?? null, channel: body.data.channel ?? null, where: body.data.where })
    return ok({ recorded: true })
})
