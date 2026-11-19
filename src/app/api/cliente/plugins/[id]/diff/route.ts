import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { pluginDiffQuerySchema } from "@/features/plugins/schemas"
import { diffPluginVersions } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/plugins/[id]/diff?to&from — diferença entre versões do plugin do cliente (admin). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    const parsed = pluginDiffQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return validationError(parsed.error)
    return ok(await diffPluginVersions(params.id, parsed.data.to, parsed.data.from ?? null, { kind: "client", clientId: String(actor.client._id) }))
})
