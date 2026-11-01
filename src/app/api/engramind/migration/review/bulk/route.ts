import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { migrationBulkSchema } from "@/features/engramind/schemas/migration"
import { reviewBulk } from "@/features/engramind/server/migration"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/migration/review/bulk — aprovar ou rejeitar em lote, por lista. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, migrationBulkSchema)
    if (!body.ok) return body.response
    return ok(await reviewBulk(body.data, getLocalUser().id))
})
