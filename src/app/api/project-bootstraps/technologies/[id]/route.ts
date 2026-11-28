import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { technologyInputSchema } from "@/features/project-bootstrap/schemas"
import { deleteTechnology, updateTechnology } from "@/features/project-bootstrap/server/catalog"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PUT /api/project-bootstraps/technologies/[id] — edita nome, variantes e grupo. */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, technologyInputSchema)
    if (!body.ok) return body.response
    return ok(await updateTechnology(params.id, body.data, getLocalUser().id))
})

/** DELETE /api/project-bootstraps/technologies/[id] — remove a tecnologia. */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deleteTechnology(params.id, getLocalUser().id)
    return ok({ id: params.id })
})
