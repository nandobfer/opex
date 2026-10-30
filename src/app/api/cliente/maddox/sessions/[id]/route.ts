import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { updateMaddoxSessionSchema } from "@/features/maddox-agent/schemas"
import { updateMaddoxSession } from "@/features/maddox-agent/server/sessions"
import { deleteSession, getSessionDetail } from "@/features/opex-agent/server/sessions"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientMaddoxEnabled } from "@/features/maddox-agent/server/client-config"
import { clientMaddoxScope } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/cliente/maddox/sessions/[id] — sessão do usuário com as mensagens. */
export const GET = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    return ok(await getSessionDetail(params.id, clientMaddoxScope(actor)))
})

/** PATCH /api/cliente/maddox/sessions/[id] — renomeia, arquiva ou troca o modelo da sessão. */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    const body = await parseBody(req, updateMaddoxSessionSchema)
    if (!body.ok) return body.response
    return ok(await updateMaddoxSession(params.id, body.data, actor.userId, clientMaddoxScope(actor)))
})

/** DELETE /api/cliente/maddox/sessions/[id] — exclui a sessão (só a própria). */
export const DELETE = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    await deleteSession(params.id, actor.userId, clientMaddoxScope(actor))
    return ok({ id: params.id })
})
