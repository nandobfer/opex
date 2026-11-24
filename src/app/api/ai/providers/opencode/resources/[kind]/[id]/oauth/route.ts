import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { idParam, uiActor } from "@/features/opencode-resources/server/route-params"
import { disconnectMcpOauthById, mcpAuthorizationById, startMcpOauthById } from "@/features/opencode-resources/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { kind: string; id: string }

/** GET — situação da autorização OAuth do MCP remoto no OpenCode. */
export const GET = withRoute<Params>(async ({ params }) => ok(await mcpAuthorizationById(idParam(params.kind, params.id))))

/** POST — Autorizar: inicia o login no OpenCode (URL do provedor + instruções). */
export const POST = withRoute<Params>(async ({ params }) => ok(await startMcpOauthById(idParam(params.kind, params.id), uiActor())))

/** DELETE — Desconectar: remove as credenciais OAuth do MCP no OpenCode. */
export const DELETE = withRoute<Params>(async ({ params }) => ok(await disconnectMcpOauthById(idParam(params.kind, params.id), uiActor())))
