import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { getClientTask, setClientTaskPriority } from "@/features/orcamentos/server/portal"
import { clienteTaskPrioritySchema } from "@/features/orcamentos/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/cliente/tasks/[id] — detalhe da tarefa na visão do cliente (só as que ele solicitou). */
export const GET = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    return ok(await getClientTask(actor.client, params.id))
})

/** PATCH /api/cliente/tasks/[id] — o cliente edita a prioridade da tarefa (só a dele). */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    const body = await parseBody(req, clienteTaskPrioritySchema)
    if (!body.ok) return body.response
    await setClientTaskPriority(actor.client, params.id, body.data.priority, actor.userId)
    return ok({ id: params.id })
})
