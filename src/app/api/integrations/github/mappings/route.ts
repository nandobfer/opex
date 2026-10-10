import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { mappingInputSchema } from "@/features/github/schemas"
import { getMapping, saveMapping } from "@/features/github/server/mappings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/github/mappings — regras de tipo e prioridade. */
export const GET = withRoute(async () => ok(await getMapping()))

/** PUT /api/integrations/github/mappings — salva as regras. */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, mappingInputSchema)
    if (!body.ok) return body.response
    return ok(await saveMapping(body.data, getLocalUser().id))
})
