import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { oauthStartSchema } from "@/features/opencode-accounts/types"
import { startOauth } from "@/features/opencode-accounts/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/ai/providers/opencode/accounts/[integrationId]/oauth — inicia um login OAuth (URL + instruções). */
export const POST = withRoute<{ integrationId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, oauthStartSchema)
    if (!body.ok) return body.response
    return ok(await startOauth(params.integrationId, body.data))
})
