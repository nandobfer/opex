import { z } from "zod"
import { fail, ok, validationError } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { chatMediaFieldsSchema, chatSendSchema } from "@/features/evolution-api/schemas"
import { conversationTimeline, sendFromInbox, sendMediaFromInbox } from "@/features/secretary-agent/server/inbox"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const beforeSchema = z.iso.datetime({ offset: true, message: "Informe uma data válida em `antes`." }).optional()

/**
 * GET /api/secretary/conversations/[chatId]/messages?antes= — página da linha do tempo (aba Conversas, OPE-197). Sem
 * `antes`, as mais recentes; com `antes` (o `nextBefore` da página anterior), as anteriores a ele (OPE-207).
 */
export const GET = withRoute<{ chatId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const before = beforeSchema.safeParse(req.nextUrl.searchParams.get("antes") || undefined)
    if (!before.success) return validationError(before.error)
    return ok(await conversationTimeline(params.chatId, before.data ? new Date(before.data) : null))
})

/**
 * POST — envio pelo dono: JSON (`chatSendSchema`: texto, reação, localização, contato) ou `multipart/form-data` com
 * `file` (foto, vídeo, documento ou voz) e os campos de `chatMediaFieldsSchema`.
 */
export const POST = withRoute<{ chatId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
        let form: FormData
        try {
            form = await req.formData()
        } catch {
            return fail(400, "Envio do arquivo inválido. Tente novamente.", "INVALID_MULTIPART")
        }
        const file = form.get("file")
        if (!(file instanceof File)) return fail(400, "Escolha um arquivo para enviar.", "MISSING_FILE")
        const fields = chatMediaFieldsSchema.safeParse({ voice: form.get("voice") ?? undefined, caption: form.get("caption") ?? undefined, quotedId: form.get("quotedId") ?? undefined })
        if (!fields.success) return validationError(fields.error)
        const bytes = Buffer.from(await file.arrayBuffer())
        return ok(await sendMediaFromInbox(params.chatId, { name: file.name || "arquivo", type: file.type, size: file.size, bytes }, fields.data))
    }
    const body = await parseBody(req, chatSendSchema)
    if (!body.ok) return body.response
    return ok(await sendFromInbox(params.chatId, body.data))
})
