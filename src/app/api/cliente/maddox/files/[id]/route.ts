import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { deletePendingOpexFile, opexFileContent } from "@/features/opex-agent/server/files"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientMaddoxEnabled } from "@/features/maddox-agent/server/client-config"
import { clientMaddoxScope } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/maddox/files/[id] — conteúdo do arquivo da sessão do usuário. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    return opexFileContent(params.id, { download: req.nextUrl.searchParams.get("download") === "1", range: req.headers.get("range") ?? undefined }, clientMaddoxScope(actor))
})

/** DELETE /api/cliente/maddox/files/[id] — remove um arquivo ainda não enviado. */
export const DELETE = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    await deletePendingOpexFile(params.id, clientMaddoxScope(actor))
    return ok({ id: params.id })
})
