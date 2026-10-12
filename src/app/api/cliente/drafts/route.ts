import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { createDraft } from "@/features/orcamentos/server/portal"
import { clienteDraftSchema } from "@/features/orcamentos/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/drafts — abre um rascunho (repositório + descrição) no portal. */
export const POST = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    const body = await parseBody(req, clienteDraftSchema)
    if (!body.ok) return body.response
    return created(await createDraft(actor.client, body.data))
})
