import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listEnvironments } from "@/features/environments/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/environments/discover — projetos do compose não gerenciados nos dois Dockers (labels). */
export const GET = withRoute(async () => {
    const list = await listEnvironments()
    return ok({ unmanaged: list.unmanaged, pcAvailable: list.pcAvailable })
})
