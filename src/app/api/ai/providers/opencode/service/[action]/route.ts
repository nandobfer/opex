import { ok } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { serviceActionBodySchema, serviceActionSchema } from "@/features/opencode-service/schemas"
import { runServiceAction } from "@/features/opencode-service/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/ai/providers/opencode/service/[start|stop|restart|upgrade] — ação por SSH (atualizar roda em segundo plano). */
export const POST = withRoute<{ action: string }>(async ({ req, params }) => {
    const action = serviceActionSchema.safeParse(params.action)
    if (!action.success) throw new DomainError(404, "Ação desconhecida", "OPENCODE_SERVICE_ACTION_NOT_FOUND")
    const body = await parseBody(req, serviceActionBodySchema)
    if (!body.ok) return body.response
    return ok(await runServiceAction(action.data, body.data, { id: getLocalUser().id, origin: "ui" }))
})
