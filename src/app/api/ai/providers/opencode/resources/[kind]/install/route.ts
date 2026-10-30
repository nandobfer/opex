import { created } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { resourceInstallSchema } from "@/features/opencode-resources/schemas"
import { kindParam, uiActor } from "@/features/opencode-resources/server/route-params"
import { installResource } from "@/features/opencode-resources/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST — instala skill (repositório), plugin ou MCP (pacote/repositório). */
export const POST = withRoute<{ kind: string }>(async ({ req, params }) => {
    const kind = kindParam(params.kind)
    const body = await parseBody(req, resourceInstallSchema)
    if (!body.ok) return body.response
    if (body.data.kind !== kind) throw new DomainError(400, "O tipo do corpo não corresponde ao da URL", "OPENCODE_RESOURCE_KIND_MISMATCH")
    return created(await installResource(body.data, uiActor()))
})
