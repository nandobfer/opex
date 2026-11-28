import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { techGroupInputSchema } from "@/features/project-bootstrap/schemas"
import { createTechGroup } from "@/features/project-bootstrap/server/catalog"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/project-bootstraps/tech-groups — novo grupo do catálogo de tecnologias. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, techGroupInputSchema)
    if (!body.ok) return body.response
    return created(await createTechGroup(body.data, getLocalUser().id))
})
