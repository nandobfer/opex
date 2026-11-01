import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { migrationImportSchema } from "@/features/engramind/schemas/migration"
import { importApproved } from "@/features/engramind/server/migration"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/migration/import — importa as aprovadas (com confirmação; repetir não duplica). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, migrationImportSchema)
    if (!body.ok) return body.response
    return ok(await importApproved(getLocalUser().id))
})
