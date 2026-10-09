import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { createCentralSchema } from "@/features/agentic/schemas"
import { createCentral, listCentrals } from "@/features/agentic/server/centrals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/centrals — centrais de desenvolvimento (uma por produto). */
export const GET = withRoute(async () => ok(await listCentrals()))

/** POST /api/agentic/centrals — nova central (produto do Go! Sipal + diretório das sessões). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, createCentralSchema)
    if (!body.ok) return body.response
    return created(await createCentral(body.data, getLocalUser().id))
})
