import { created } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { resolveAttachmentActor } from "@/features/tasks/attachments/server/actor"
import { completeAttachmentUpload } from "@/features/tasks/attachments/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** POST /api/attachments/uploads/[id]/complete — confirma o envio (confere, promove e marca pronto). */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const actor = await resolveAttachmentActor(req)
    return created(await completeAttachmentUpload(actor, params.id))
})
