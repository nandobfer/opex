import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getDraft } from "@/features/orcamentos/server/portal"
import { requireClient } from "@/features/orcamentos/server/token"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/cliente/drafts/[id] — rascunho do portal (prévia + estado). */
export const GET = withRoute<Params>(async ({ req, params }) => ok(await getDraft(await requireClient(req), params.id)))
