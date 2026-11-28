import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { technologyInputSchema } from "@/features/project-bootstrap/schemas"
import { createTechnology } from "@/features/project-bootstrap/server/catalog"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/project-bootstraps/technologies — nova tecnologia do catálogo. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, technologyInputSchema)
    if (!body.ok) return body.response
    return created(await createTechnology(body.data, getLocalUser().id))
})
