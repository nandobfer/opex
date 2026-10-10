import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getClientOptions } from "@/features/orcamentos/server/portal"
import { requireClient } from "@/features/orcamentos/server/token"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/options — nome do cliente e repositórios permitidos (portal). */
export const GET = withRoute(async ({ req }) => ok(await getClientOptions(await requireClient(req))))
