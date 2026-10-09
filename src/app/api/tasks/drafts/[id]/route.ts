import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { updateDraftSchema } from "@/features/github/schemas"
import { getDraftDetail, updateDraft } from "@/features/github/server/drafts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/tasks/drafts/[id] — rascunho completo (id `draft-…`). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getDraftDetail(params.id)))

/** PATCH /api/tasks/drafts/[id] — edita campos (viram "editados") ou `restore` volta ao valor da issue. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, updateDraftSchema)
    if (!body.ok) return body.response
    return ok(await updateDraft(params.id, body.data, getLocalUser().id))
})
