import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { migrationCompactSchema } from "@/features/engramind/schemas/migration"
import { compactCombination } from "@/features/engramind/server/migration"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/migration/compact — "Compactar com o curador" numa combinação acima do orçamento. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, migrationCompactSchema)
    if (!body.ok) return body.response
    return ok(await compactCombination(body.data.combination, getLocalUser().id))
})
