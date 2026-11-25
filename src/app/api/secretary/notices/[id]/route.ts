import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { noticeActionSchema } from "@/features/secretary-agent/schemas"
import { answerNotice, discardNotice } from "@/features/secretary-agent/server/owner-questions"

export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, noticeActionSchema)
    if (!body.ok) return body.response
    if (body.data.action === "answer") await answerNotice(params.id, body.data.answer)
    else await discardNotice(params.id)
    return ok({ saved: true })
})
