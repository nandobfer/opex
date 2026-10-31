import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { applyAiSourceSchema } from "@/features/engramind/schemas/ai-source"
import { applyOpexAiSource, getOpexAiSourceState } from "@/features/engramind/server/ai-source"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/providers/from-opex — origem e sincronização da IA do Redator e do embedding. */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await getOpexAiSourceState())
})

/** POST /api/engramind/providers/from-opex — aplica provedor/modelo do Opex numa seção e copia a chave. */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const parsed = await parseBody(req, applyAiSourceSchema)
    if (!parsed.ok) return parsed.response
    return ok(await applyOpexAiSource(parsed.data, getLocalUser().id))
})
