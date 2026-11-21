import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { idParam } from "@/features/opencode-resources/server/route-params"
import { cancelMcpOauthById, mcpOauthStatusById } from "@/features/opencode-resources/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { kind: string; id: string; attemptId: string }

/** GET — situação da tentativa de login (pendente, concluída, falhou ou expirou). */
export const GET = withRoute<Params>(async ({ params }) => ok(await mcpOauthStatusById(idParam(params.kind, params.id), params.attemptId)))

/** DELETE — cancela a tentativa. */
export const DELETE = withRoute<Params>(async ({ params }) => {
    await cancelMcpOauthById(idParam(params.kind, params.id), params.attemptId)
    return ok({ cancelled: true })
})
