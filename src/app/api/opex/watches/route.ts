import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { opexWatchListQuerySchema } from "@/features/opex-agent/watches"
import { listOpexWatches } from "@/features/opex-agent/server/watches"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/opex/watches?filter=active|finished|all&origin=all|owner|client&clientId=&userId=&sessionId= —
 * observações de evento do Agente Opex (do dono e dos usuários do portal).
 */
export const GET = withRoute(async ({ req }) => {
    const params = new URL(req.url).searchParams
    const query = opexWatchListQuerySchema.safeParse({
        filter: params.get("filter") ?? undefined,
        origin: params.get("origin") ?? undefined,
        clientId: params.get("clientId") || undefined,
        userId: params.get("userId") || undefined,
        sessionId: params.get("sessionId") || undefined,
    })
    return ok(await listOpexWatches(query.success ? query.data : { filter: "active", origin: "all" }))
})
