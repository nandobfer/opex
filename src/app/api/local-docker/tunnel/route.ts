import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { localDockerTunnelActionSchema } from "@/features/local-docker/schemas"
import { closeTunnel, openTunnel } from "@/features/local-docker/server/tunnel"
import { assertBuilderMachineActive } from "@/features/local-docker/server/active"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/local-docker/tunnel `{ action: "open" | "close", confirm? }` — abre ou fecha o túnel do
 * Docker do PC. Fechar com prévias no ar no PC responde 409 sem `confirm: true`.
 */
export const POST = withRoute(async ({ req }) => {
    await assertBuilderMachineActive()
    const body = await parseBody(req, localDockerTunnelActionSchema)
    if (!body.ok) return body.response
    const actorId = getLocalUser().id
    return ok(body.data.action === "open" ? await openTunnel(actorId) : await closeTunnel(actorId, body.data.confirm === true))
})
