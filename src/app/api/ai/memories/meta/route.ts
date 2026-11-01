import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getMemoriesMeta } from "@/features/ai/server/agent-memory-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/memories/meta — limites e categorias do Engramind, migração pendente e saúde do contexto. */
export const GET = withRoute(async () => ok(await getMemoriesMeta()))
