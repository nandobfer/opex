import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { mcpSecretsSchema } from "@/features/opencode-resources/schemas"
import { idParam, uiActor } from "@/features/opencode-resources/server/route-params"
import { setMcpSecretsById } from "@/features/opencode-resources/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PUT { environment?, headers? } — grava/remove segredos do MCP (os valores nunca voltam). */
export const PUT = withRoute<{ kind: string; id: string }>(async ({ req, params }) => {
    const id = idParam(params.kind, params.id)
    const body = await parseBody(req, mcpSecretsSchema)
    if (!body.ok) return body.response
    return ok(await setMcpSecretsById(id, body.data, uiActor()))
})
