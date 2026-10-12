import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { resolveAttachmentActor } from "@/features/tasks/attachments/server/actor"
import { deleteAttachment } from "@/features/tasks/attachments/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/**
 * DELETE /api/attachments/[id] — exclui um anexo. O dono remove qualquer anexo; o usuário do portal
 * só o que ele mesmo enviou e ainda não foi vinculado (anexo de tarefa só o dono exclui).
 */
export const DELETE = withRoute<Params>(async ({ req, params }) => {
    const actor = await resolveAttachmentActor(req)
    await deleteAttachment(actor, params.id)
    return ok({ id: params.id })
})
