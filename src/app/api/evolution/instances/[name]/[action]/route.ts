import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { runInstanceAction } from "@/features/evolution-api/server/instances"
import { instanceParam } from "@/features/evolution-api/server/params"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/evolution/instances/[name]/restart|logout — reinicia ou desconecta (logout) a instância. */
export const POST = withRoute<{ name: string; action: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    if (params.action !== "restart" && params.action !== "logout") throw new DomainError(404, "Ação desconhecida", "NOT_FOUND")
    return ok(await runInstanceAction(instanceParam(params.name), params.action, getLocalUser().id))
})
