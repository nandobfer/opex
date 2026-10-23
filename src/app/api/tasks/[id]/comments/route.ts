import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { commentSchema } from "@/features/tasks/schemas"
import { addComment } from "@/features/tasks/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/tasks/[id]/comments — adiciona um comentário à tarefa; `lineRef` comenta uma linha. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, commentSchema)
    if (!body.ok) return body.response
    await addComment(params.id, body.data, { id: getLocalUser().id, type: "owner", name: getLocalUser().name })
    return created({ id: params.id })
})
