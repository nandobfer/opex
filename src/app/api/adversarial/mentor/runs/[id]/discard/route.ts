import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { discardMentorRun } from "@/features/adversarial-agent/server/mentor/run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/adversarial/mentor/runs/[id]/discard — descarta a memória sugerida (nada é gravado). */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await discardMentorRun(params.id, getLocalUser().id)))
