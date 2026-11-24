import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { environmentsBuilderSchema } from "@/features/environments/schemas"
import { getBuilderStatus, saveBuilderConfig } from "@/features/environments/server/builder"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/environments/builder — estado do builder do buildx do servidor (existe, limites, uso). */
export const GET = withRoute(async () => {
    return ok(await getBuilderStatus())
})

/** PUT /api/environments/builder — salva nome, limites e opções e aplica (recria com --keep-state ou fica pendente). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, environmentsBuilderSchema)
    if (!body.ok) return body.response
    return ok(await saveBuilderConfig(body.data, getLocalUser().id))
})
