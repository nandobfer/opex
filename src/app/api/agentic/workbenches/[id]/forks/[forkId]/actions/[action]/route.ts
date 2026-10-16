import { ok } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { feedbackSchema, forkApplySchema } from "@/features/agentic/schemas"
import { applyForkIntegration, cancelForkIntegration, closeFork, integrateFork, interruptFork, resumeFork, retryFork, reviseForkSummary } from "@/features/agentic/server/forks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const WITHOUT_BODY = { close: closeFork, resume: resumeFork, interrupt: interruptFork, retry: retryFork, integrate: integrateFork, "cancel-integration": cancelForkIntegration } as const

/**
 * POST /api/agentic/workbenches/[id]/forks/[forkId]/actions/[action] — ações do fork. `close`, `resume`,
 * `interrupt`, `retry`, `integrate` e `cancel-integration` não têm corpo; `revise-summary` exige
 * `{ text }` (ajuste do resumo) e `apply` exige `{ target }` (`context`, `planner` ou `reopen`).
 */
export const POST = withRoute<{ id: string; forkId: string; action: string }>(async ({ req, params }) => {
    if (params.action === "revise-summary") {
        const body = await parseBody(req, feedbackSchema)
        if (!body.ok) return body.response
        return ok(await reviseForkSummary(params.id, params.forkId, body.data.text))
    }
    if (params.action === "apply") {
        const body = await parseBody(req, forkApplySchema)
        if (!body.ok) return body.response
        return ok(await applyForkIntegration(params.id, params.forkId, body.data.target))
    }
    if (params.action in WITHOUT_BODY) return ok(await WITHOUT_BODY[params.action as keyof typeof WITHOUT_BODY](params.id, params.forkId))
    throw new DomainError(404, "Ação desconhecida", "UNKNOWN_ACTION")
})
