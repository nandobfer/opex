import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { reserveChatFileSchema } from "@/lib/chat-files/kind"
import { reserveAgenticFile } from "@/features/agentic/server/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/agentic/files — reserva o envio de um anexo de um campo da mesa de trabalho (nome, tamanho
 * e tipo) e devolve a URL assinada do PUT direto no Storage S3. 413 `AGENTIC_FILE_TOO_LARGE` acima de
 * 100 MB. Depois do PUT, confirme em `POST /api/agentic/files/[id]/complete` e envie o id em `fileIds`
 * da ação. Sem uso, o arquivo some em 24 h.
 */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, reserveChatFileSchema)
    if (!body.ok) return body.response
    return created(await reserveAgenticFile(body.data))
})
