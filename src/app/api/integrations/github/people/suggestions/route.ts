import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { acceptSuggestionsSchema } from "@/features/github/schemas"
import { acceptSuggestions, suggestPeople } from "@/features/github/server/people"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/integrations/github/people/suggestions — sugere correspondências (nome/e-mail). */
export const POST = withRoute(async () => ok(await suggestPeople()))

/** PUT /api/integrations/github/people/suggestions — `{ logins }` aceita as sugestões. */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, acceptSuggestionsSchema)
    if (!body.ok) return body.response
    return ok(await acceptSuggestions(body.data.logins, getLocalUser().id))
})
