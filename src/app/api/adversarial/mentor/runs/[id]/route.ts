import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getMentorRun } from "@/features/adversarial-agent/server/mentor/run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/adversarial/mentor/runs/[id] — uma execução do Agente Mentor (painel da sugestão no aviso da mesa). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getMentorRun(params.id)))
