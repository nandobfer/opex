import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { routineSecretUpdateSchema } from "@/features/routine-agents/schemas"
import { deleteRoutineSecret, updateRoutineSecret } from "@/features/routine-agents/server/secrets"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string; secretId: string }

/** PATCH /api/routine-agents/[id]/secrets/[secretId] — nome, descrição, domínios e (opcional) o valor novo. */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, routineSecretUpdateSchema)
    if (!body.ok) return body.response
    return ok(await updateRoutineSecret(params.id, params.secretId, body.data, getLocalUser().id))
})

/** DELETE — exclui o segredo. */
export const DELETE = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await deleteRoutineSecret(params.id, params.secretId, getLocalUser().id))
})
