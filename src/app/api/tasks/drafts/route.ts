import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { createDraftSchema } from "@/features/orcamentos/schemas"
import { createOwnerDraft } from "@/features/orcamentos/server/owner"
import { ownerAttachmentActor } from "@/features/tasks/attachments/server/actor"
import { linkAttachmentsToDraft } from "@/features/tasks/attachments/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/tasks/drafts — abre um rascunho de prévia do **dono** (repositório vinculado + descrição).
 * Autenticado pela sessão (sem token de cliente): o rascunho nasce com `clientId: null`. Os anexos
 * enviados no formulário ficam vinculados ao rascunho e passam para a tarefa na aprovação.
 */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, createDraftSchema)
    if (!body.ok) return body.response
    const draft = await createOwnerDraft(body.data)
    await linkAttachmentsToDraft(ownerAttachmentActor(), body.data.attachmentIds ?? [], draft.id)
    return created(draft)
})
