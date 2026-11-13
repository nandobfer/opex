import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getRelatedMemories } from "@/features/engramind/server/related-memories"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/related-memories — similares de cada memória (ids e notas) para a visualização "Relacionadas" (OPE-164). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await getRelatedMemories())
})
