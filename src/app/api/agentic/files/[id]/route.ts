import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { agenticFileContent, deletePendingAgenticFile } from "@/features/agentic/server/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/files/[id] — conteúdo do anexo (imagem, áudio e vídeo inline; `?download=1` sempre baixa; aceita `Range`). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    return agenticFileContent(params.id, { download: req.nextUrl.searchParams.get("download") === "1", range: req.headers.get("range") ?? undefined })
})

/** DELETE /api/agentic/files/[id] — cancela o envio ou remove um anexo ainda não enviado (409 se já foi numa mensagem). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deletePendingAgenticFile(params.id)
    return ok({ id: params.id })
})
