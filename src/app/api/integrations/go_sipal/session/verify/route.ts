import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { goSipalVerifyCodeSchema } from "@/features/go-sipal/session/schemas"
import { verifyGoSipalCode } from "@/features/go-sipal/session/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/integrations/go_sipal/session/verify — confirma o código e guarda o JWT (cifrado). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, goSipalVerifyCodeSchema)
    if (!body.ok) return body.response
    return ok(await verifyGoSipalCode(body.data.code, getLocalUser().id))
})
