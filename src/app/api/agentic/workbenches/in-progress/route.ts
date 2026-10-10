import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listWorkbenchesInProgress } from "@/features/agentic/server/in-progress"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/workbenches/in-progress — mesas em andamento (executando ou aguardando ação). */
export const GET = withRoute(async () => ok(await listWorkbenchesInProgress()))
