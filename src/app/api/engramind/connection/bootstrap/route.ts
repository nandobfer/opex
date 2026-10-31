import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { runBootstrap } from "@/features/engramind/server/bootstrap"
import { getConnection } from "@/features/engramind/server/connection"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/connection/bootstrap — repete a configuração automática (seguro: o app `opex` é reaproveitado). */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const steps = await runBootstrap(getLocalUser().id)
    return ok({ connection: await getConnection(), steps })
})
