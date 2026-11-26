import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { listSecretaryConversations } from "@/features/secretary-agent/server/conversations"

export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await listSecretaryConversations())
})
