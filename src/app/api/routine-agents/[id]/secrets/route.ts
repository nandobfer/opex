import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { routineSecretCreateSchema } from "@/features/routine-agents/schemas"
import { createRoutineSecret, listRoutineSecrets } from "@/features/routine-agents/server/secrets"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/routine-agents/[id]/secrets — segredos do agente (sem o valor: ele só entra). */
export const GET = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await listRoutineSecrets(params.id))
})

/** POST — cria um segredo (valor cifrado no banco). */
export const POST = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, routineSecretCreateSchema)
    if (!body.ok) return body.response
    return ok(await createRoutineSecret(params.id, body.data, getLocalUser().id), { status: 201 })
})
