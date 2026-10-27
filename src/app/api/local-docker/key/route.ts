import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { localDockerKeyActionSchema } from "@/features/local-docker/schemas"
import { setServerKey } from "@/features/local-docker/server/key"
import { assertBuilderMachineActive } from "@/features/local-docker/server/active"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/local-docker/key `{ action: "generate" } | { action: "import", privateKey }` — troca a chave
 * do servidor. Nunca devolve a chave: só a origem e a impressão digital.
 */
export const POST = withRoute(async ({ req }) => {
    await assertBuilderMachineActive()
    const body = await parseBody(req, localDockerKeyActionSchema)
    if (!body.ok) return body.response
    return ok(await setServerKey(body.data, getLocalUser().id))
})
