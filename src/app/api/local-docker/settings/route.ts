import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { localDockerSettingsSchema } from "@/features/local-docker/schemas"
import { getLocalDockerSettings, saveLocalDockerSettings } from "@/features/local-docker/server/settings"
import { assertBuilderMachineActive } from "@/features/local-docker/server/active"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/local-docker/settings — configuração da Builder Machine, situação da chave e o último preparo. */
export const GET = withRoute(async () => {
    await assertBuilderMachineActive()
    return ok(await getLocalDockerSettings())
})

/** PUT /api/local-docker/settings — salva a configuração da máquina local. */
export const PUT = withRoute(async ({ req }) => {
    await assertBuilderMachineActive()
    const body = await parseBody(req, localDockerSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveLocalDockerSettings(body.data, getLocalUser().id))
})
