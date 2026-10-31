import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { envUpdateSchema } from "@/features/engramind/schemas/env"
import { readEngramindEnv, updateEngramindEnv } from "@/features/engramind/server/host-env"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/env — `.env` do Engramind lido no host pelo OpenCode (sensíveis só como configurada/não). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await readEngramindEnv())
})

/** PUT /api/engramind/env — grava as chaves alteradas no host (sem reiniciar). */
export const PUT = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, envUpdateSchema)
    if (!body.ok) return body.response
    return ok(await updateEngramindEnv(body.data, getLocalUser().id))
})
