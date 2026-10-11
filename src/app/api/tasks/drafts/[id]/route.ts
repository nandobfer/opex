import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getOwnerDraft } from "@/features/orcamentos/server/owner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/tasks/drafts/[id] — rascunho da prévia do dono (prévia + estimativa). */
export const GET = withRoute<Params>(async ({ params }) => ok(await getOwnerDraft(params.id)))
