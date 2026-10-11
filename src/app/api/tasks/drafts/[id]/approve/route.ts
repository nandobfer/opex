import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { clienteApproveSchema } from "@/features/orcamentos/schemas"
import { approveOwnerDraft } from "@/features/orcamentos/server/owner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/**
 * POST /api/tasks/drafts/[id]/approve — cria a tarefa do dono conforme a prévia aprovada (com issue no
 * GitHub). O corpo opcional `{ priority }` sobrepõe a prioridade sugerida pela IA. Ator: o dono local.
 */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const body = await parseBody(req, clienteApproveSchema)
    if (!body.ok) return body.response
    return created(await approveOwnerDraft(params.id, getLocalUser().id, body.data.priority))
})
