import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { personMappingSchema } from "@/features/github/schemas"
import { setPersonMapping } from "@/features/github/server/people"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/integrations/github/people/[login] — `{ developerId, developerName }` (`null` desfaz). */
export const PATCH = withRoute<{ login: string }>(async ({ req, params }) => {
    const body = await parseBody(req, personMappingSchema)
    if (!body.ok) return body.response
    const developer = body.data.developerId ? { id: body.data.developerId, name: body.data.developerName ?? "—" } : null
    return ok(await setPersonMapping(decodeURIComponent(params.login), developer, getLocalUser().id))
})
