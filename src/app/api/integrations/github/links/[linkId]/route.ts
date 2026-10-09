import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { removeLinkSchema, repoLinkInputSchema } from "@/features/github/schemas"
import { deleteLink, updateLink } from "@/features/github/server/links"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/integrations/github/links/[linkId] — edita o vínculo. */
export const PATCH = withRoute<{ linkId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, repoLinkInputSchema)
    if (!body.ok) return body.response
    return ok(await updateLink(params.linkId, body.data, getLocalUser().id))
})

/** DELETE /api/integrations/github/links/[linkId] — `{ drafts: "keep" | "discard" }` para os rascunhos pendentes. */
export const DELETE = withRoute<{ linkId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, removeLinkSchema)
    if (!body.ok) return body.response
    await deleteLink(params.linkId, body.data.drafts, getLocalUser().id)
    return ok({ id: params.linkId })
})
