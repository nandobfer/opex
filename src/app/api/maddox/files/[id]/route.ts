import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { deletePendingOpexFile, opexFileContent } from "@/features/opex-agent/server/files"
import { MADDOX_OWNER_SCOPE } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/files/[id] — conteúdo do arquivo (`?download=1` baixa; aceita `Range`). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) =>
    opexFileContent(params.id, { download: req.nextUrl.searchParams.get("download") === "1", range: req.headers.get("range") ?? undefined }, MADDOX_OWNER_SCOPE),
)

/** DELETE /api/maddox/files/[id] — remove um arquivo ainda não enviado. */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deletePendingOpexFile(params.id, MADDOX_OWNER_SCOPE)
    return ok({ id: params.id })
})
