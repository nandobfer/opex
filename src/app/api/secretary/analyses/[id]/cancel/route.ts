import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { cancelAnalysis } from "@/features/secretary-agent/server/analysis"
import { getLocalUser } from "@/lib/local-user"

export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    await cancelAnalysis(params.id, getLocalUser().id)
    return ok({ cancelling: true })
})
