import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getMigration } from "@/features/engramind/server/migration"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/migration — estado da migração das memórias dos agentes (etapas, itens, relatório). */
export const GET = withRoute(async () => ok(await getMigration()))
