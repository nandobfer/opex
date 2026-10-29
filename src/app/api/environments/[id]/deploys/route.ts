import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listDeploys } from "@/features/environments/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/environments/[id]/deploys — últimos deploys (sem o log). */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    return ok(await listDeploys(params.id))
})
