import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { approveDraft } from "@/features/orcamentos/server/portal"
import { requireClient } from "@/features/orcamentos/server/token"
import { clienteApproveSchema } from "@/features/orcamentos/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/**
 * POST /api/cliente/drafts/[id]/approve — cria a tarefa de acordo com a prévia aprovada. O corpo
 * opcional `{ priority }` usa a prioridade escolhida na revisão no lugar da sugerida pela IA.
 */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const client = await requireClient(req)
    const body = await parseBody(req, clienteApproveSchema)
    if (!body.ok) return body.response
    return created(await approveDraft(client, params.id, client.name, body.data.priority))
})
