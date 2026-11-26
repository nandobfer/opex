import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { composeSaveSchema } from "@/features/environments/schemas"
import { listComposeRevisions, saveComposeRevision } from "@/features/environments/server/compose-revisions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/environments/[id]/compose — compose gerenciado: a revisão vigente (com o conteúdo) e o histórico. */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    return ok(await listComposeRevisions(params.id))
})

/**
 * PUT /api/environments/[id]/compose — grava uma revisão nova (nunca sobrescreve). 422 com a linha para
 * YAML inválido, vazio ou grande demais, e para conteúdo igual ao da revisão vigente.
 */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, composeSaveSchema)
    if (!body.ok) return body.response
    return ok(await saveComposeRevision(params.id, body.data, getLocalUser().id))
})
