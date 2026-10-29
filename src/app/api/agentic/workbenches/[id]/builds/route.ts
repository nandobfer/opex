import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listBuilds } from "@/features/agentic/server/build-logs"
import { getWorkbench } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/workbenches/[id]/builds — builds da prévia da mesa (aba "Build (N)"), sem o log. */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    await getWorkbench(params.id)
    return ok(await listBuilds(params.id))
})
