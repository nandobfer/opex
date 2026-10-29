import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { commandStartSchema } from "@/features/opencode-accounts/types"
import { startCommand } from "@/features/opencode-accounts/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/ai/providers/opencode/accounts/[integrationId]/command — inicia um login por comando (roda na máquina do OpenCode). */
export const POST = withRoute<{ integrationId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, commandStartSchema)
    if (!body.ok) return body.response
    return ok(await startCommand(params.integrationId, body.data))
})
