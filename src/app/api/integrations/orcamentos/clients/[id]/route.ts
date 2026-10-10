import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { clienteOrcamentoSchema } from "@/features/orcamentos/schemas"
import { deleteClient, updateClient } from "@/features/orcamentos/server/clients"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** PATCH /api/integrations/orcamentos/clients/[id] — edita o cliente. */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    const body = await parseBody(req, clienteOrcamentoSchema)
    if (!body.ok) return body.response
    return ok(await updateClient(params.id, body.data, getLocalUser().id))
})

/** DELETE /api/integrations/orcamentos/clients/[id] — exclui o cliente e os rascunhos dele. */
export const DELETE = withRoute<Params>(async ({ params }) => {
    await deleteClient(params.id, getLocalUser().id)
    return ok({ id: params.id })
})
