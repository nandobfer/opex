import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { sendDraftSchema } from "@/features/github/schemas"
import { sendDraft } from "@/features/github/server/drafts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/tasks/drafts/[id]/send — cria a tarefa no Go! Sipal (status + valores do modal). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, sendDraftSchema)
    if (!body.ok) return body.response
    return ok(await sendDraft(params.id, body.data, getLocalUser().id))
})
