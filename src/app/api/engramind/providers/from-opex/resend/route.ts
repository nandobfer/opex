import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { resendAiKeySchema } from "@/features/engramind/schemas/ai-source"
import { resendOpexAiKey } from "@/features/engramind/server/ai-source"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/providers/from-opex/resend — reenvia só a chave da origem de uma seção. */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const parsed = await parseBody(req, resendAiKeySchema)
    if (!parsed.ok) return parsed.response
    return ok(await resendOpexAiKey(parsed.data, getLocalUser().id))
})
