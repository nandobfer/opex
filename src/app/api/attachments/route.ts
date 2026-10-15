import { created, ok, validationError } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { resolveAttachmentActor } from "@/features/tasks/attachments/server/actor"
import { listAttachments, reserveAttachmentUpload } from "@/features/tasks/attachments/server/service"
import { attachmentListQuerySchema, attachmentReserveSchema } from "@/features/tasks/attachments/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/attachments?taskId=… — anexos confirmados da tarefa.
 * GET /api/attachments?draftId=… — anexos de um rascunho de prévia.
 * GET /api/attachments?serviceId=… — anexos de um serviço do Financeiro.
 */
export const GET = withRoute(async ({ req }) => {
    const actor = await resolveAttachmentActor(req)
    const parsed = attachmentListQuerySchema.safeParse({
        taskId: req.nextUrl.searchParams.get("taskId")?.trim() || undefined,
        draftId: req.nextUrl.searchParams.get("draftId")?.trim() || undefined,
        serviceId: req.nextUrl.searchParams.get("serviceId")?.trim() || undefined,
    })
    if (!parsed.success) return validationError(parsed.error)
    return ok(await listAttachments(actor, parsed.data))
})

/** POST /api/attachments — reserva o envio de um arquivo (devolve a URL assinada de PUT). */
export const POST = withRoute(async ({ req }) => {
    const actor = await resolveAttachmentActor(req)
    const body = await parseBody(req, attachmentReserveSchema)
    if (!body.ok) return body.response
    return created(await reserveAttachmentUpload(actor, body.data))
})
