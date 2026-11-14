import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { recoverOrphanMentorRuns } from "@/features/adversarial-agent/server/mentor/queue"
import { listWorkbenchMentorRuns } from "@/features/adversarial-agent/server/mentor/run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/adversarial/workbenches/[id]/mentor-runs — execuções de aprendizado do Agente Mentor na mesa
 * (uma por conclusão e tentativa, mais recentes primeiro), com os casos e as operações (aba "Aprendizado").
 */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    await recoverOrphanMentorRuns()
    return ok(await listWorkbenchMentorRuns(params.id))
})
