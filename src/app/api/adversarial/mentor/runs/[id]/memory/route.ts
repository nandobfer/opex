import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getMentorRunMemory } from "@/features/adversarial-agent/server/mentor/run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/adversarial/mentor/runs/[id]/memory — resumo (Engramind) da memória gravada pela execução. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getMentorRunMemory(params.id)))
