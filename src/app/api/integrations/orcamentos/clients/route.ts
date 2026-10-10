import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { clienteOrcamentoSchema } from "@/features/orcamentos/schemas"
import { createClient, listClients } from "@/features/orcamentos/server/clients"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/orcamentos/clients — clientes do portal (sem o token). */
export const GET = withRoute(async () => ok(await listClients()))

/** POST /api/integrations/orcamentos/clients — novo cliente (devolve o token uma única vez). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, clienteOrcamentoSchema)
    if (!body.ok) return body.response
    return created(await createClient(body.data, getLocalUser().id))
})
