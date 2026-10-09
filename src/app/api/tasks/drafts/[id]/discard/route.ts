import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { discardDraft } from "@/features/github/server/drafts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/tasks/drafts/[id]/discard — descarta (a rotina não recria; dá para restaurar). */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    await discardDraft(params.id, getLocalUser().id)
    return ok({ id: params.id })
})
