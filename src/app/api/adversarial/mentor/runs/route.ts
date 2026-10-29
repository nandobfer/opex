import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { recoverOrphanMentorRuns } from "@/features/adversarial-agent/server/mentor/queue"
import { listMentorRuns } from "@/features/adversarial-agent/server/mentor/run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/adversarial/mentor/runs — as 100 execuções mais recentes do Agente Mentor. */
export const GET = withRoute(async () => {
    await recoverOrphanMentorRuns()
    return ok(await listMentorRuns())
})
