import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { migrationItemPatchSchema } from "@/features/engramind/schemas/migration"
import { reviewItems } from "@/features/engramind/server/migration"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/engramind/migration/items — aprovar, rejeitar ou editar (texto e categoria) memórias. */
export const PATCH = withRoute(async ({ req }) => {
    const body = await parseBody(req, migrationItemPatchSchema)
    if (!body.ok) return body.response
    return ok(await reviewItems(body.data, getLocalUser().id))
})
