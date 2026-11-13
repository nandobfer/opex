import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getMentorLearningRun } from "@/features/adversarial-agent/server/mentor/run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/adversarial/mentor/runs/[id] — uma execução do Agente Mentor, com os casos no aprendizado (detalhe e painel da sugestão). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getMentorLearningRun(params.id)))
