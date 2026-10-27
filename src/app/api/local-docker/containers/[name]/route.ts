import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { localDockerContainerActionSchema } from "@/features/local-docker/schemas"
import { runContainerAction } from "@/features/local-docker/server/containers"
import { assertBuilderMachineActive } from "@/features/local-docker/server/active"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/local-docker/containers/[name] `{ action: "start" | "stop" | "recreate" | "delete", confirm? }` —
 * ação num container de prévia ou de ambiente do PC. `delete` (com imagem, volumes e rede) exige `confirm: true`.
 */
export const POST = withRoute<{ name: string }>(async ({ req, params }) => {
    await assertBuilderMachineActive()
    const body = await parseBody(req, localDockerContainerActionSchema)
    if (!body.ok) return body.response
    return ok(await runContainerAction(params.name, body.data.action, body.data.confirm === true, getLocalUser().id))
})
