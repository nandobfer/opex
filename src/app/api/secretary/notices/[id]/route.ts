import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { noticeActionSchema } from "@/features/secretary-agent/schemas"
import { answerNotice, discardNotice } from "@/features/secretary-agent/server/owner-questions"

export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, noticeActionSchema)
    if (!body.ok) return body.response
    const actorId = getLocalUser().id
    if (body.data.action === "answer") await answerNotice(params.id, body.data.answer, actorId)
    else await discardNotice(params.id, actorId)
    return ok({ saved: true })
})
