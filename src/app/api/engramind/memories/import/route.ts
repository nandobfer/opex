import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { importInputSchema } from "@/features/engramind/schemas/import"
import { importEngramindMemories } from "@/features/engramind/server/operations-runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/memories/import — importa um lote num canal (chave de idempotência do canal + conteúdo). */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, importInputSchema)
    if (!body.ok) return body.response
    return ok(await importEngramindMemories(body.data, getLocalUser().id))
})
