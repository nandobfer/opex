import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { idParam } from "@/features/opencode-resources/server/route-params"
import { testMcpById } from "@/features/opencode-resources/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST — teste de conexão do MCP: situação e ferramentas expostas. */
export const POST = withRoute<{ kind: string; id: string }>(async ({ params }) => ok(await testMcpById(idParam(params.kind, params.id))))
