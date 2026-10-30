import { created, ok, validationError } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { resourceCreateSchema, scopeQuerySchema } from "@/features/opencode-resources/schemas"
import { kindParam, uiActor } from "@/features/opencode-resources/server/route-params"
import { createResource, listResources } from "@/features/opencode-resources/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET ?scope=&refresh=1 — itens do tipo no escopo (sem segredos). */
export const GET = withRoute<{ kind: string }>(async ({ req, params }) => {
    const kind = kindParam(params.kind)
    const parsed = scopeQuerySchema.safeParse({ scope: req.nextUrl.searchParams.get("scope") ?? undefined })
    if (!parsed.success) return validationError(parsed.error)
    return ok(await listResources(kind, parsed.data.scope, { refresh: req.nextUrl.searchParams.get("refresh") === "1" }))
})

/** POST — cria (skill, agente, comando ou MCP) com backup antes. */
export const POST = withRoute<{ kind: string }>(async ({ req, params }) => {
    const kind = kindParam(params.kind)
    const body = await parseBody(req, resourceCreateSchema)
    if (!body.ok) return body.response
    if (body.data.kind !== kind) throw new DomainError(400, "O tipo do corpo não corresponde ao da URL", "OPENCODE_RESOURCE_KIND_MISMATCH")
    return created(await createResource(body.data, uiActor()))
})
