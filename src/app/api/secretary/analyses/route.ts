import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { analysisStartSchema } from "@/features/secretary-agent/schemas"
import { listAnalyses, startAnalysis } from "@/features/secretary-agent/server/analysis"

export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await listAnalyses())
})
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, analysisStartSchema)
    if (!body.ok) return body.response
    return ok(await startAnalysis(body.data, getLocalUser().id))
})
