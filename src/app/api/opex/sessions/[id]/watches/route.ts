import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listSessionWatches } from "@/features/opex-agent/server/watches"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/sessions/[id]/watches — observações ativas da sessão (faixa "Observando…" do chat). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await listSessionWatches(params.id)))
