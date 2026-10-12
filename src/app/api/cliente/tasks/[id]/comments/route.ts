import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { addClientComment } from "@/features/orcamentos/server/portal"
import { clienteCommentSchema } from "@/features/orcamentos/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** POST /api/cliente/tasks/[id]/comments — comentário do usuário numa tarefa que ele solicitou. */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    const body = await parseBody(req, clienteCommentSchema)
    if (!body.ok) return body.response
    await addClientComment(actor.client, params.id, body.data.content, { id: actor.userId, name: actor.displayName })
    return created({ id: params.id })
})
