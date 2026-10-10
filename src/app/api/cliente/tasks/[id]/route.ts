import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getClientTask, setClientTaskPriority } from "@/features/orcamentos/server/portal"
import { requireClient } from "@/features/orcamentos/server/token"
import { clienteTaskPrioritySchema } from "@/features/orcamentos/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/cliente/tasks/[id] — detalhe da tarefa na visão do cliente (só as que ele solicitou). */
export const GET = withRoute<Params>(async ({ req, params }) => {
    const client = await requireClient(req)
    return ok(await getClientTask(client, params.id))
})

/** PATCH /api/cliente/tasks/[id] — o cliente edita a prioridade da tarefa (só a dele). */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    const client = await requireClient(req)
    const body = await parseBody(req, clienteTaskPrioritySchema)
    if (!body.ok) return body.response
    await setClientTaskPriority(client, params.id, body.data.priority)
    return ok({ id: params.id })
})
