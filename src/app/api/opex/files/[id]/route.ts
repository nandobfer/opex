import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { deletePendingOpexFile, opexFileContent } from "@/features/opex-agent/server/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/files/[id] — conteúdo do storage (imagem, áudio e vídeo inline; `?download=1` sempre baixa; aceita `Range`). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) =>
    opexFileContent(params.id, { download: req.nextUrl.searchParams.get("download") === "1", range: req.headers.get("range") ?? undefined }),
)

/** DELETE /api/opex/files/[id] — remove um arquivo ainda não enviado (409 `OPEX_FILE_SENT` se já foi numa mensagem). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deletePendingOpexFile(params.id)
    return ok({ id: params.id })
})
