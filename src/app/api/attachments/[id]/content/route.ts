import { resolveAttachmentActor } from "@/features/tasks/attachments/server/actor"
import { readAttachmentContent } from "@/features/tasks/attachments/server/service"
import { withRoute } from "@/lib/api/route"
import { fail } from "@/lib/api/responses"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/**
 * `GET /api/attachments/[id]/content` — conteúdo do anexo por uma rota **autenticada** (dono ou
 * usuário do cliente dono do anexo). É a URL estável guardada na descrição; a URL assinada do
 * storage nunca é exposta.
 *
 * Mídia segura (imagem sem SVG, áudio e vídeo) é servida inline; o restante sempre baixa. `?download=1`
 * força o download. Responde a `Range` (a reprodução de áudio/vídeo precisa disso).
 */
export const GET = withRoute<Params>(async ({ req, params }) => {
    const actor = await resolveAttachmentActor(req)
    const content = await readAttachmentContent(actor, params.id, {
        range: req.headers.get("range") ?? undefined,
        download: req.nextUrl.searchParams.get("download") === "1",
    })
    if (!content.body) return fail(404, "Anexo indisponível", "ATTACHMENT_NOT_FOUND")

    const disposition = content.inline ? "inline" : "attachment"
    const filename = encodeURIComponent(content.name)
    const status = content.contentRange ? 206 : 200
    return new Response(content.body, {
        status,
        headers: {
            "Content-Type": content.contentType,
            "Content-Disposition": `${disposition}; filename*=UTF-8''${filename}`,
            "X-Content-Type-Options": "nosniff",
            "Accept-Ranges": content.acceptRanges,
            "Cache-Control": "private, max-age=300",
            ...(content.contentRange ? { "Content-Range": content.contentRange } : {}),
            ...(content.contentLength != null && !content.contentRange ? { "Content-Length": String(content.contentLength) } : {}),
        },
    })
})
