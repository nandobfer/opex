import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { keyConnectSchema } from "@/features/opencode-accounts/types"
import { connectWithKey } from "@/features/opencode-accounts/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/ai/providers/opencode/accounts/[integrationId]/key — adiciona uma conta por chave de API (a chave não volta na resposta). */
export const POST = withRoute<{ integrationId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, keyConnectSchema)
    if (!body.ok) return body.response
    await connectWithKey(params.integrationId, body.data)
    return ok({ connected: true })
})
