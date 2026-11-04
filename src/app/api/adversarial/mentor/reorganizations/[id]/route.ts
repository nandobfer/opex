import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getMentorReorg } from "@/features/adversarial-agent/server/mentor/reorganize"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/adversarial/mentor/reorganizations/[id] — o Plano de reorganização com os itens. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getMentorReorg(params.id)))
