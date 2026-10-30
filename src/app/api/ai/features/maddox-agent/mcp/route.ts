import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getMaddoxMcpStatus } from "@/features/maddox-agent/server/mcp-status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/maddox-agent/mcp — situação dos MCPs do Opex no OpenCode (`?reconnect=1` registra de novo). */
export const GET = withRoute(async ({ req }) => ok(await getMaddoxMcpStatus({ reconnect: req.nextUrl.searchParams.get("reconnect") === "1" })))
