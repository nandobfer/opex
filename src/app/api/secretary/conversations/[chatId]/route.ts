import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { conversationActionSchema } from "@/features/secretary-agent/schemas"
import { changeConversation } from "@/features/secretary-agent/server/conversations"

export const POST = withRoute<{ chatId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, conversationActionSchema)
    if (!body.ok) return body.response
    return ok(await changeConversation(params.chatId, body.data, getLocalUser().id))
})
