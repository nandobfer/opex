import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { localDockerOverrideSchema } from "@/features/local-docker/schemas"
import { getCentralOverride, setCentralOverride } from "@/features/local-docker/server/overrides"
import { assertBuilderMachineActive } from "@/features/local-docker/server/active"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/local-docker/centrals/[id] — a central herda, força ou dispensa a máquina local. */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    await assertBuilderMachineActive()
    return ok(await getCentralOverride(params.id))
})

/** PUT /api/local-docker/centrals/[id] `{ mode: "inherit" | "on" | "off" }`. */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    await assertBuilderMachineActive()
    const body = await parseBody(req, localDockerOverrideSchema)
    if (!body.ok) return body.response
    return ok(await setCentralOverride(params.id, body.data.mode, getLocalUser().id))
})
