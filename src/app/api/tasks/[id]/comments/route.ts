import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { z } from "zod"
import { addComment } from "@/features/tasks/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const commentSchema = z.object({ content: z.string().trim().min(1, "Escreva um comentário").max(5000, "Máximo de 5000 caracteres") })

/** POST /api/tasks/[id]/comments — adiciona um comentário à tarefa. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, commentSchema)
    if (!body.ok) return body.response
    await addComment(params.id, body.data.content, { id: getLocalUser().id, type: "owner", name: getLocalUser().name })
    return created({ id: params.id })
})
