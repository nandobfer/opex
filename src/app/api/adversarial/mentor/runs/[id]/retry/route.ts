import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { retryMentorLearning } from "@/features/adversarial-agent/server/mentor/hooks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/adversarial/mentor/runs/[id]/retry — Tentar novamente o aprendizado que falhou (a tentativa
 * mais recente da conclusão, sem outra em andamento). 409 nos demais casos.
 */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok({ id: await retryMentorLearning(params.id, getLocalUser().id) }))
