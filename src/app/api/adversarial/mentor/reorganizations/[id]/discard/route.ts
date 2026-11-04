import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { mentorReorgDiscardSchema } from "@/features/adversarial-agent/mentor/schemas"
import { discardMentorReorg } from "@/features/adversarial-agent/server/mentor/reorganize"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/adversarial/mentor/reorganizations/[id]/discard { itemIds? } — descarta sem alterar nada. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, mentorReorgDiscardSchema)
    if (!body.ok) return body.response
    return ok(await discardMentorReorg(params.id, body.data, getLocalUser().id))
})
