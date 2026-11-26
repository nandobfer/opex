import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { checkNumberSchema } from "@/features/evolution-api/schemas"
import { checkNumber } from "@/features/evolution-api/server/contacts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/evolution/check-number — consulta se o número tem WhatsApp. */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, checkNumberSchema)
    if (!body.ok) return body.response
    return ok(await checkNumber(body.data.number))
})
