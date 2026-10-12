import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { createDraft } from "@/features/orcamentos/server/portal"
import { createDraftSchema } from "@/features/orcamentos/schemas"
import { clientAttachmentActor } from "@/features/tasks/attachments/server/actor"
import { linkAttachmentsToDraft } from "@/features/tasks/attachments/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/cliente/drafts — abre um rascunho (repositório + descrição) no portal. Os anexos
 * enviados no formulário (`attachmentIds`) ficam vinculados ao rascunho e passam para a tarefa na
 * aprovação.
 */
export const POST = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    const body = await parseBody(req, createDraftSchema)
    if (!body.ok) return body.response
    const draft = await createDraft(actor.client, body.data)
    const attachments = clientAttachmentActor({ clientId: String(actor.client._id), userId: actor.userId, name: actor.displayName })
    await linkAttachmentsToDraft(attachments, body.data.attachmentIds ?? [], draft.id)
    return created(draft)
})
