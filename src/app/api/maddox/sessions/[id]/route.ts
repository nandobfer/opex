import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { updateMaddoxSessionSchema } from "@/features/maddox-agent/schemas"
import { MADDOX_OWNER_SCOPE, updateMaddoxSession } from "@/features/maddox-agent/server/sessions"
import { deleteSession, getSessionDetail } from "@/features/opex-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/sessions/[id] — sessão com as mensagens gravadas. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getSessionDetail(params.id, MADDOX_OWNER_SCOPE)))

/** PATCH /api/maddox/sessions/[id] — renomeia, arquiva ou troca o modelo só desta sessão (`model: null` = padrão). */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, updateMaddoxSessionSchema)
    if (!body.ok) return body.response
    return ok(await updateMaddoxSession(params.id, body.data, getLocalUser().id, MADDOX_OWNER_SCOPE))
})

/** DELETE /api/maddox/sessions/[id] — exclui a sessão (mensagens, arquivos e a sessão do OpenCode). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deleteSession(params.id, getLocalUser().id, MADDOX_OWNER_SCOPE)
    return ok({ id: params.id })
})
