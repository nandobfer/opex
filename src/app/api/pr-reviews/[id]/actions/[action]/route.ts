import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { PR_REVIEW_ACTIONS } from "@/features/pr-review/constants"
import { rerunPrReview, stopPrReview } from "@/features/pr-review/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/pr-reviews/[id]/actions/[action] — revisar de novo (`rerun`) ou parar (`stop`). */
export const POST = withRoute<{ id: string; action: string }>(async ({ params }) => {
    if (!(PR_REVIEW_ACTIONS as readonly string[]).includes(params.action)) throw new DomainError(400, "Ação inválida", "PR_REVIEW_INVALID_ACTION")
    if (params.action === "stop") return ok(await stopPrReview(params.id))
    return ok(await rerunPrReview(params.id))
})
