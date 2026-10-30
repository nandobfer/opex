import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listMaddoxModels } from "@/features/maddox-agent/server/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/models — catálogo de modelos do OpenCode (seletor de modelo da sessão). */
export const GET = withRoute(async () => ok(await listMaddoxModels()))
