import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listOpencodeScopes } from "@/features/opencode-resources/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/providers/opencode/scopes — Global + o diretório de cada central (projeto). */
export const GET = withRoute(async () => ok(await listOpencodeScopes()))
