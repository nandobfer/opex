import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { clienteDraftSchema } from "@/features/orcamentos/schemas"
import { createOwnerDraft } from "@/features/orcamentos/server/owner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/tasks/drafts — abre um rascunho de prévia do **dono** (repositório vinculado + descrição).
 * Autenticado pela sessão (sem token de cliente): o rascunho nasce com `clientId: null`.
 */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, clienteDraftSchema)
    if (!body.ok) return body.response
    return created(await createOwnerDraft(body.data))
})
