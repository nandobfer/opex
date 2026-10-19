import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientOpexEnabled } from "@/features/opex-agent/server/client-config"
import { deletePendingOpexFile, opexFileContent } from "@/features/opex-agent/server/files"
import { clientOpexScope } from "@/features/opex-agent/server/scope"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/opex/files/[id] — conteúdo do arquivo da sessão do usuário. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    return opexFileContent(params.id, { download: req.nextUrl.searchParams.get("download") === "1", range: req.headers.get("range") ?? undefined }, clientOpexScope(actor))
})

/** DELETE /api/cliente/opex/files/[id] — remove um arquivo ainda não enviado. */
export const DELETE = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    await deletePendingOpexFile(params.id, clientOpexScope(actor))
    return ok({ id: params.id })
})
