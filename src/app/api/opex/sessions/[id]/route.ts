import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { updateOpexSessionSchema } from "@/features/opex-agent/schemas"
import { deleteSession, getSessionDetail, updateSession } from "@/features/opex-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/sessions/[id] — sessão com as mensagens gravadas. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getSessionDetail(params.id)))

/** PATCH /api/opex/sessions/[id] — renomeia (título passa a ser manual) ou arquiva. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, updateOpexSessionSchema)
    if (!body.ok) return body.response
    return ok(await updateSession(params.id, body.data, getLocalUser().id))
})

/** DELETE /api/opex/sessions/[id] — exclui a sessão, as mensagens, as ações pendentes e os arquivos (storage + metadados). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deleteSession(params.id, getLocalUser().id)
    return ok({ id: params.id })
})
