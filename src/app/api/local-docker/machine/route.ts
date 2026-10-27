import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { localDockerMachineActionSchema } from "@/features/local-docker/schemas"
import { runMachineAction } from "@/features/local-docker/server/machine"
import { assertBuilderMachineActive } from "@/features/local-docker/server/active"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/local-docker/machine `{ action: "test" | "prepare" }` — testar a conexão ou preparar o Docker do PC, passo a passo. */
export const POST = withRoute(async ({ req }) => {
    await assertBuilderMachineActive()
    const body = await parseBody(req, localDockerMachineActionSchema)
    if (!body.ok) return body.response
    return ok(await runMachineAction(body.data.action, getLocalUser().id))
})
