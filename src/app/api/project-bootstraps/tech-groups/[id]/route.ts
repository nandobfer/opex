import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { techGroupInputSchema } from "@/features/project-bootstrap/schemas"
import { deleteTechGroup, updateTechGroup } from "@/features/project-bootstrap/server/catalog"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PUT /api/project-bootstraps/tech-groups/[id] — renomeia ou troca a cor do grupo. */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, techGroupInputSchema)
    if (!body.ok) return body.response
    return ok(await updateTechGroup(params.id, body.data, getLocalUser().id))
})

/** DELETE /api/project-bootstraps/tech-groups/[id] — remove o grupo (só sem tecnologias). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deleteTechGroup(params.id, getLocalUser().id)
    return ok({ id: params.id })
})
