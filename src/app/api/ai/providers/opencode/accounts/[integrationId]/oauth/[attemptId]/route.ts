import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { oauthCompleteSchema } from "@/features/opencode-accounts/types"
import { cancelLogin, completeOauth, oauthStatus } from "@/features/opencode-accounts/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { integrationId: string; attemptId: string }

/** GET — status do login OAuth (modo automático). */
export const GET = withRoute<Params>(async ({ params }) => ok(await oauthStatus(params.integrationId, params.attemptId)))

/** POST — conclui o login do modo código com o código colado. */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const body = await parseBody(req, oauthCompleteSchema)
    if (!body.ok) return body.response
    await completeOauth(params.integrationId, params.attemptId, body.data.code)
    return ok({ connected: true })
})

/** DELETE — cancela o login. */
export const DELETE = withRoute<Params>(async ({ params }) => {
    await cancelLogin("oauth", params.integrationId, params.attemptId)
    return ok({ cancelled: true })
})
