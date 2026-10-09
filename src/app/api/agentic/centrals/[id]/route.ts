import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { centralConfigSchema } from "@/features/agentic/schemas"
import { deleteCentral, getCentral, updateCentral } from "@/features/agentic/server/centrals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getCentral(params.id)))

/** PUT /api/agentic/centrals/[id] — salva a configuração da central. */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, centralConfigSchema)
    if (!body.ok) return body.response
    return ok(await updateCentral(params.id, body.data, getLocalUser().id))
})

/** DELETE /api/agentic/centrals/[id] — só sem mesas em andamento. */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deleteCentral(params.id, getLocalUser().id)
    return ok({ deleted: true })
})
