import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getClientTask } from "@/features/orcamentos/server/portal"
import { requireClient } from "@/features/orcamentos/server/token"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/cliente/tasks/[id] — detalhe da tarefa na visão do cliente (só as que ele solicitou). */
export const GET = withRoute<Params>(async ({ req, params }) => {
    const client = await requireClient(req)
    return ok(await getClientTask(client, params.id))
})
