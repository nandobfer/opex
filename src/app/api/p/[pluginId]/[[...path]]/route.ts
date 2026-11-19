import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { dispatchPluginRoute } from "@/features/plugins/server/dispatch"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Rotas de plugin do dono (OPE-172): `/api/p/{pluginId}/{...}` despacha para o handler registrado
 * pela fiber do plugin (`ctx.routes.on`). Com a prévia do plugin ligada neste navegador, vale a
 * fiber de prévia.
 */
const handler = withRoute<{ pluginId: string; path?: string[] }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const dispatched = await dispatchPluginRoute(req, params.pluginId, params.path ?? [])
    if (!dispatched.found) throw new DomainError(404, "Rota do plugin não encontrada", "PLUGIN_ROUTE_NOT_FOUND")
    return dispatched.result instanceof Response ? dispatched.result : ok(dispatched.result ?? null)
})

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
