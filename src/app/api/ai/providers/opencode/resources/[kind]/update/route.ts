import { ok, validationError } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { resourceUpdateManySchema, scopeQuerySchema } from "@/features/opencode-resources/schemas"
import { kindParam, uiActor } from "@/features/opencode-resources/server/route-params"
import { updateResources } from "@/features/opencode-resources/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST ?scope= { ids } | { all: true } — atualiza para a versão disponível (individual ou em massa). */
export const POST = withRoute<{ kind: string }>(async ({ req, params }) => {
    const kind = kindParam(params.kind)
    const scope = scopeQuerySchema.safeParse({ scope: req.nextUrl.searchParams.get("scope") ?? undefined })
    if (!scope.success) return validationError(scope.error)
    const body = await parseBody(req, resourceUpdateManySchema)
    if (!body.ok) return body.response
    return ok(await updateResources(kind, scope.data.scope, body.data, uiActor()))
})
