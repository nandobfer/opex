import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { applyEnvironmentKey, getEvolutionPrefill } from "@/features/evolution-api/server/prefill"
import { buildIntegrationUpdateSchema } from "@/features/integrations/schemas/integration.schema"
import { getIntegrationDef } from "@/lib/integrations/catalog"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Valores inferidos do ambiente `evolution-api`, sem a chave. */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await getEvolutionPrefill())
})

/** Grava o formulário e a chave do ambiente na mesma atualização. */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, buildIntegrationUpdateSchema(getIntegrationDef("evolution-api")))
    if (!body.ok) return body.response
    return ok(await applyEnvironmentKey({ ...body.data, secrets: undefined }, getLocalUser().id))
})
