import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { engramindSse } from "@/features/engramind/server/live"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/engramind/events — SSE da rede do Engramind (lib `@engramind/client`, OPE-116): só o dono.
 * Eventos `engramind` com ids, slugs e tipos (webhook e mutações do gestor), inclusive `memory.consumed`.
 */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return engramindSse(req)
})
