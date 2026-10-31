import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientMaddoxEnabled } from "@/features/maddox-agent/server/client-config"
import { listMaddoxModels } from "@/features/maddox-agent/server/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/maddox/models — catálogo de modelos do OpenCode para o seletor da sessão (Maddox ligado). */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    return ok(await listMaddoxModels())
})
