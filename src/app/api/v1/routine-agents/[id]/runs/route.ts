import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireApiToken } from "@/features/integrations/api-tokens/service"
import { publicRouteScope } from "@/features/public-api/routes"
import { routineWebhookBodySchema } from "@/features/routine-agents/schemas"
import { triggerRoutineRunFromWebhook } from "@/features/routine-agents/server/webhook"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/v1/routine-agents/{id}/runs — webhook externo: dispara uma execução do agente rotineiro
 * (token de sistema com o escopo `api:v1:routine-agents`). Documentado em `openapi/spec.ts`.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const token = await requireApiToken(req, { scope: publicRouteScope("/api/v1/routine-agents/{id}/runs") })
    const body = await parseBody(req, routineWebhookBodySchema)
    if (!body.ok) return body.response
    return ok(await triggerRoutineRunFromWebhook(params.id, body.data, { id: token.id, nome: token.nome }), { status: 201 })
})
