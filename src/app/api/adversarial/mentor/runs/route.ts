import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { mentorRunListQuerySchema } from "@/features/adversarial-agent/mentor/schemas"
import { recoverOrphanMentorRuns } from "@/features/adversarial-agent/server/mentor/queue"
import { listMentorRuns } from "@/features/adversarial-agent/server/mentor/run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/adversarial/mentor/runs?q&statuses&sources&triggers&centrals&from&to&page&limit —
 * execuções do Agente Mentor paginadas no recorte dos filtros (listas em CSV, datas ISO) e as centrais.
 */
export const GET = withRoute(async ({ req }) => {
    const params = req.nextUrl.searchParams
    const keys = ["q", "statuses", "sources", "triggers", "centrals", "from", "to", "page", "limit"] as const
    const query = mentorRunListQuerySchema.safeParse(Object.fromEntries(keys.map((key) => [key, params.get(key) ?? undefined])))
    if (!query.success) return validationError(query.error)
    await recoverOrphanMentorRuns()
    return ok(await listMentorRuns(query.data))
})
