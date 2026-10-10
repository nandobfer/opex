import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { setDraftCorrection } from "@/features/orcamentos/server/portal"
import { requireClient } from "@/features/orcamentos/server/token"
import { clienteCorrectionSchema } from "@/features/orcamentos/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** POST /api/cliente/drafts/[id]/correction — registra a correção pedida pelo cliente. */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const client = await requireClient(req)
    const body = await parseBody(req, clienteCorrectionSchema)
    if (!body.ok) return body.response
    return ok(await setDraftCorrection(client, params.id, body.data.correction))
})
