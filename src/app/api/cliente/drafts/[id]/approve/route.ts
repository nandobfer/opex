import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { approveDraft } from "@/features/orcamentos/server/portal"
import { clienteApproveSchema } from "@/features/orcamentos/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/**
 * POST /api/cliente/drafts/[id]/approve — cria a tarefa de acordo com a prévia aprovada. O corpo
 * opcional `{ priority }` usa a prioridade escolhida na revisão no lugar da sugerida pela IA.
 */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    const body = await parseBody(req, clienteApproveSchema)
    if (!body.ok) return body.response
    return created(await approveDraft(actor.client, params.id, actor.userId, body.data.priority))
})
