import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { getClientServiceDetail } from "@/features/orcamentos/server/portal-services"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/servicos/[id] — detalhe de um serviço do cliente (admin): descrição, anexos e custo. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    return ok(await getClientServiceDetail(String(actor.client._id), params.id))
})
