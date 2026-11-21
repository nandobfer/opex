import { ok } from "@/lib/api/responses"
import { publicOriginOf } from "@/lib/api/public-origin"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { disconnectMcpOauth, startMcpOauth } from "@/features/opex-agent/server/mcp/oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** POST /api/opex/mcp-servers/[id]/oauth — inicia a autorização OAuth (devolve a página do provedor). */
export const POST = withRoute<Params>(async ({ req, params }) => ok(await startMcpOauth(params.id, publicOriginOf(req.headers, req.url), getLocalUser().id)))

/** DELETE …/[id]/oauth — desconecta: revoga no provedor (melhor esforço) e apaga os tokens. */
export const DELETE = withRoute<Params>(async ({ params }) => ok(await disconnectMcpOauth(params.id, getLocalUser().id)))
