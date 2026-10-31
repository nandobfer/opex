import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { apiTokenScopeCatalog } from "@/features/integrations/api-tokens/scope-catalog"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/internal_api/scopes — escopos que um token pode receber (rotas e ferramentas do MCP do dono). */
export const GET = withRoute(async () => ok(await apiTokenScopeCatalog()))
