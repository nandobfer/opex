import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { composeRestoreSchema } from "@/features/environments/schemas"
import { restoreComposeRevision } from "@/features/environments/server/compose-revisions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/environments/[id]/compose/restore — cria uma revisão nova com o conteúdo da escolhida. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, composeRestoreSchema)
    if (!body.ok) return body.response
    return ok(await restoreComposeRevision(params.id, body.data.version, getLocalUser().id))
})
