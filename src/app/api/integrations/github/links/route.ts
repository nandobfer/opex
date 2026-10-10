import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { repoLinkInputSchema } from "@/features/github/schemas"
import { createLink, listLinks } from "@/features/github/server/links"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/github/links — vínculos repositório ↔ Opex. */
export const GET = withRoute(async () => ok(await listLinks()))

/** POST /api/integrations/github/links — novo vínculo (409 se o repositório já estiver vinculado). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, repoLinkInputSchema)
    if (!body.ok) return body.response
    return created(await createLink(body.data, getLocalUser().id))
})
