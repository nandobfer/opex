import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { updateOpexSessionSchema } from "@/features/opex-agent/schemas"
import { assertClientOpexEnabled } from "@/features/opex-agent/server/client-config"
import { deleteSession, getSessionDetail, updateSession } from "@/features/opex-agent/server/sessions"
import { clientOpexScope } from "@/features/opex-agent/server/scope"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/cliente/opex/sessions/[id] — sessão do usuário com as mensagens gravadas. */
export const GET = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    return ok(await getSessionDetail(params.id, clientOpexScope(actor)))
})

/** PATCH /api/cliente/opex/sessions/[id] — renomeia ou arquiva (só a própria sessão). */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    const body = await parseBody(req, updateOpexSessionSchema)
    if (!body.ok) return body.response
    return ok(await updateSession(params.id, body.data, actor.userId, clientOpexScope(actor)))
})

/** DELETE /api/cliente/opex/sessions/[id] — exclui a sessão, as mensagens, as ações e os arquivos. */
export const DELETE = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    await deleteSession(params.id, actor.userId, clientOpexScope(actor))
    return ok({ id: params.id })
})
