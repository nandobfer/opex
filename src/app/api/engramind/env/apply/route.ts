import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { envApplySchema } from "@/features/engramind/schemas/env"
import { applyEngramindEnv } from "@/features/engramind/server/host-env"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/env/apply — "Aplicar e reiniciar" (recria o serviço `api`; log em `/env/apply/events`). */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, envApplySchema)
    if (!body.ok) return body.response
    return ok(await applyEngramindEnv(getLocalUser().id))
})
