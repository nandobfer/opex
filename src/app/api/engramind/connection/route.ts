import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { connectionInputSchema } from "@/features/engramind/schemas/connection"
import { saveConnection } from "@/features/engramind/server/bootstrap"
import { getConnection } from "@/features/engramind/server/connection"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/connection — URLs, Ambiente, `whoami` e o estado do webhook (sem segredos). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await getConnection())
})

/** PUT /api/engramind/connection — grava a conexão e roda o bootstrap (token de bootstrap → token do Opex + webhook). */
export const PUT = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, connectionInputSchema)
    if (!body.ok) return body.response
    return ok(await saveConnection(body.data, getLocalUser().id))
})
