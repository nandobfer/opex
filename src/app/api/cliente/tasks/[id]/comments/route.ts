import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { addClientComment } from "@/features/orcamentos/server/portal"
import { requireClient } from "@/features/orcamentos/server/token"
import { clienteCommentSchema } from "@/features/orcamentos/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** POST /api/cliente/tasks/[id]/comments — o cliente comenta numa tarefa que ele solicitou. */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const client = await requireClient(req)
    const body = await parseBody(req, clienteCommentSchema)
    if (!body.ok) return body.response
    await addClientComment(client, params.id, body.data.content)
    return created({ id: params.id })
})
