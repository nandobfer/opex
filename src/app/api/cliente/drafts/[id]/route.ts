import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { getDraft } from "@/features/orcamentos/server/portal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/cliente/drafts/[id] — rascunho do portal (prévia + estado). */
export const GET = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    return ok(await getDraft(actor.client, params.id))
})
