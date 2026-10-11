import { ok } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { feedbackSchema, optionalFeedbackSchema } from "@/features/agentic/schemas"
import { approve, implement, interrupt, reconnect, reopen, requestCorrection, retry, revisePlan, submitPrFeedback } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const WITH_FEEDBACK = { "revise-plan": revisePlan, "request-correction": requestCorrection, "submit-pr-feedback": submitPrFeedback, reopen } as const
const WITH_OPTIONAL_TEXT = { implement } as const
const WITHOUT_BODY = { approve, retry, interrupt, reconnect } as const

/**
 * POST /api/agentic/workbenches/[id]/actions/[action] — ações da mesa. `revise-plan`,
 * `request-correction`, `submit-pr-feedback` e `reopen` exigem `{ text }` (vai para o planejador);
 * `implement` aceita `{ text? }` (informações adicionais anexadas ao prompt de implementação);
 * `approve`, `retry`, `interrupt` e `reconnect` não têm corpo. Responde na hora com a mesa: a saída do agente
 * chega pelo stream de eventos.
 */
export const POST = withRoute<{ id: string; action: string }>(async ({ req, params }) => {
    if (params.action in WITH_FEEDBACK) {
        const body = await parseBody(req, feedbackSchema)
        if (!body.ok) return body.response
        return ok(await WITH_FEEDBACK[params.action as keyof typeof WITH_FEEDBACK](params.id, body.data.text))
    }
    if (params.action in WITH_OPTIONAL_TEXT) {
        const body = await parseBody(req, optionalFeedbackSchema)
        if (!body.ok) return body.response
        return ok(await WITH_OPTIONAL_TEXT[params.action as keyof typeof WITH_OPTIONAL_TEXT](params.id, body.data.text))
    }
    if (params.action in WITHOUT_BODY) return ok(await WITHOUT_BODY[params.action as keyof typeof WITHOUT_BODY](params.id))
    throw new DomainError(404, "Ação desconhecida", "UNKNOWN_ACTION")
})
