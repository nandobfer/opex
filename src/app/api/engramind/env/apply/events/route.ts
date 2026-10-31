import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { openApplyStream } from "@/features/engramind/server/apply-hub"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/env/apply/events — log ao vivo (NDJSON) do "Aplicar e reiniciar" em andamento ou do último. */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return openApplyStream(req.signal)
})
