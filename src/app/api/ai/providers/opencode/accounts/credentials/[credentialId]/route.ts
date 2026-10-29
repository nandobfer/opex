import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { renameAccountSchema } from "@/features/opencode-accounts/types"
import { removeAccount, renameAccount } from "@/features/opencode-accounts/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH — renomeia a conta. */
export const PATCH = withRoute<{ credentialId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, renameAccountSchema)
    if (!body.ok) return body.response
    await renameAccount(params.credentialId, body.data.label)
    return ok({ renamed: true })
})

/** DELETE — remove a conta do OpenCode. */
export const DELETE = withRoute<{ credentialId: string }>(async ({ params }) => {
    await removeAccount(params.credentialId)
    return ok({ removed: true })
})
