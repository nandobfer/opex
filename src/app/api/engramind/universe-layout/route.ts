import { universeLayoutSchema } from "@engramind/client"
import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { getUniverseLayout, resetUniverseLayout, saveUniverseLayout } from "@/features/engramind/server/universe-layout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/universe-layout — a configuração em uso (o padrão da lib quando nada foi gravado). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await getUniverseLayout())
})

/** PUT /api/engramind/universe-layout — grava a configuração completa (campo desconhecido ou fora do intervalo é recusado). */
export const PUT = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, universeLayoutSchema)
    if (!body.ok) return body.response
    return ok(await saveUniverseLayout(body.data, getLocalUser().id))
})

/** DELETE /api/engramind/universe-layout — volta ao padrão. */
export const DELETE = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await resetUniverseLayout(getLocalUser().id))
})
