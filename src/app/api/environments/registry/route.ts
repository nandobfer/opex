import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { ensureRegistry, getRegistryStatus } from "@/features/environments/server/registry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/environments/registry — estado do registry local. */
export const GET = withRoute(async () => {
    return ok(await getRegistryStatus())
})

/** POST /api/environments/registry — cria/sobe o registry (127.0.0.1 apenas). */
export const POST = withRoute(async () => {
    return ok(await ensureRegistry())
})
