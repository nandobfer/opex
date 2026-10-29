import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { cancelLogin, commandStatus } from "@/features/opencode-accounts/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { integrationId: string; attemptId: string }

/** GET — status do login por comando. */
export const GET = withRoute<Params>(async ({ params }) => ok(await commandStatus(params.integrationId, params.attemptId)))

/** DELETE — cancela o login por comando. */
export const DELETE = withRoute<Params>(async ({ params }) => {
    await cancelLogin("command", params.integrationId, params.attemptId)
    return ok({ cancelled: true })
})
