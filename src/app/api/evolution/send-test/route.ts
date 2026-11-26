import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { sendTestSchema } from "@/features/evolution-api/schemas"
import { sendTestMessage } from "@/features/evolution-api/server/contacts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/evolution/send-test — envia uma mensagem de teste pela instância padrão. */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, sendTestSchema)
    if (!body.ok) return body.response
    return ok(await sendTestMessage(body.data, getLocalUser().id))
})
