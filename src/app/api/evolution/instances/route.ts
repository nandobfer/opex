import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { createInstanceSchema, selectInstanceSchema } from "@/features/evolution-api/schemas"
import { createInstance, listInstances, selectInstance } from "@/features/evolution-api/server/instances"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/evolution/instances — instâncias da Evolution e a padrão do Opex. */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await listInstances())
})

/** POST /api/evolution/instances — cria a instância (vira a padrão). */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, createInstanceSchema)
    if (!body.ok) return body.response
    return ok(await createInstance(body.data.name, getLocalUser().id))
})

/** PUT /api/evolution/instances — escolhe a instância padrão. */
export const PUT = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, selectInstanceSchema)
    if (!body.ok) return body.response
    return ok(await selectInstance(body.data.name, getLocalUser().id))
})
