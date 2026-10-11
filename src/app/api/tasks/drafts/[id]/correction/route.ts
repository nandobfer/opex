import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { clienteCorrectionSchema } from "@/features/orcamentos/schemas"
import { setOwnerCorrection } from "@/features/orcamentos/server/owner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** POST /api/tasks/drafts/[id]/correction — registra o ajuste pedido pelo dono antes de regenerar a prévia. */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const body = await parseBody(req, clienteCorrectionSchema)
    if (!body.ok) return body.response
    return ok(await setOwnerCorrection(params.id, body.data.correction))
})
