import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { resolveAttachmentActor } from "@/features/tasks/attachments/server/actor"
import { cancelAttachmentUpload } from "@/features/tasks/attachments/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** DELETE /api/attachments/uploads/[id] — cancela um envio ainda não confirmado. */
export const DELETE = withRoute<Params>(async ({ req, params }) => {
    const actor = await resolveAttachmentActor(req)
    await cancelAttachmentUpload(actor, params.id)
    return ok({ id: params.id })
})
