import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { activateAccount } from "@/features/opencode-accounts/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST — seleciona a conta que o provider usa (as próximas chamadas do OpenCode usam esta conta). */
export const POST = withRoute<{ credentialId: string }>(async ({ params }) => {
    await activateAccount(params.credentialId)
    return ok({ activated: true })
})
