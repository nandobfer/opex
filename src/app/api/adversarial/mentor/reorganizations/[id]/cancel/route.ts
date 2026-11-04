import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { cancelMentorReorg } from "@/features/adversarial-agent/server/mentor/reorg-queue"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/adversarial/mentor/reorganizations/[id]/cancel — interrompe a revisão em andamento. */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await cancelMentorReorg(params.id)))
