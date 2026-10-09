import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { columnInputSchema } from "@/features/tasks/schemas"
import { deleteColumn, updateColumn } from "@/features/tasks/server/columns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/tasks/columns/[key] — edita a coluna customizada. */
export const PATCH = withRoute<{ key: string }>(async ({ req, params }) => {
    const body = await parseBody(req, columnInputSchema)
    if (!body.ok) return body.response
    return ok(await updateColumn(params.key, body.data, getLocalUser().id))
})

/** DELETE /api/tasks/columns/[key] — exclui coluna VAZIA (409 se tiver tarefas). */
export const DELETE = withRoute<{ key: string }>(async ({ params }) => {
    await deleteColumn(params.key, getLocalUser().id)
    return ok({ key: params.key })
})
