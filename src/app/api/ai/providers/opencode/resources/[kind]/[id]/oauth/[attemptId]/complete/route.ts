import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { mcpOauthCompleteSchema } from "@/features/opencode-resources/schemas"
import { idParam } from "@/features/opencode-resources/server/route-params"
import { completeMcpOauthById } from "@/features/opencode-resources/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST — conclui o login com o código ou com a URL de retorno colada (repassada ao loopback do host). */
export const POST = withRoute<{ kind: string; id: string; attemptId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, mcpOauthCompleteSchema)
    if (!body.ok) return body.response
    return ok(await completeMcpOauthById(idParam(params.kind, params.id), params.attemptId, body.data))
})
