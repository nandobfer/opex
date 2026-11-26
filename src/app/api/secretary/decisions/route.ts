import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { decisionListQuerySchema } from "@/features/secretary-agent/schemas"
import { listSecretaryDecisions } from "@/features/secretary-agent/server/decisions"

/** GET /api/secretary/decisions?jid&decision&from&to&page&limit — aba Decisões (listas em CSV, datas ISO). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const params = req.nextUrl.searchParams
    const keys = ["jid", "decision", "from", "to", "page", "limit"] as const
    const query = decisionListQuerySchema.safeParse(Object.fromEntries(keys.map((key) => [key, params.get(key) ?? undefined])))
    if (!query.success) return validationError(query.error)
    return ok(await listSecretaryDecisions(query.data))
})
