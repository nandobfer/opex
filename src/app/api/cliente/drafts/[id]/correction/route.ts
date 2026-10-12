import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { setDraftCorrection } from "@/features/orcamentos/server/portal"
import { clienteCorrectionSchema } from "@/features/orcamentos/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** POST /api/cliente/drafts/[id]/correction — registra a correção pedida pelo cliente. */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    const body = await parseBody(req, clienteCorrectionSchema)
    if (!body.ok) return body.response
    return ok(await setDraftCorrection(actor.client, params.id, body.data.correction))
})
