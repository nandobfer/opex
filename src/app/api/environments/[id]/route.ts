import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { environmentInputSchema } from "@/features/environments/schemas"
import { deleteEnvironment } from "@/features/environments/server/deploy"
import { getEnvironment, updateEnvironment } from "@/features/environments/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = withRoute<{ id: string }>(async ({ params }) => {
    return ok(await getEnvironment(params.id))
})

/** PUT /api/environments/[id] — edita (variável com valor vazio mantém o valor salvo). */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, environmentInputSchema)
    if (!body.ok) return body.response
    await updateEnvironment(params.id, body.data, getLocalUser().id)
    return ok(await getEnvironment(params.id))
})

/** DELETE /api/environments/[id]?volumes=1 — derruba onde estiver e apaga (volumes só com `volumes=1`). */
export const DELETE = withRoute<{ id: string }>(async ({ req, params }) => {
    await deleteEnvironment(params.id, { volumes: req.nextUrl.searchParams.get("volumes") === "1" }, getLocalUser().id)
    return ok({ id: params.id })
})
