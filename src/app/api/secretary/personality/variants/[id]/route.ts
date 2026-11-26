import { ok } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { jidSchema, variantSchema } from "@/features/secretary-agent/schemas"
import { loadPersonality, writeVersion } from "@/features/secretary-agent/server/personality"

/** Jid da variante vindo da URL (o cliente manda `encodeURIComponent(jid)`): decodificado e validado. */
function variantJidParam(raw: string): string {
    let value = raw
    try {
        value = decodeURIComponent(raw)
    } catch {
        throw new DomainError(400, "Conversa inválida", "SECRETARY_VARIANT_INVALID")
    }
    const parsed = jidSchema.safeParse(value)
    if (!parsed.success) throw new DomainError(400, "Conversa inválida", "SECRETARY_VARIANT_INVALID")
    return parsed.data
}

export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const jid = variantJidParam(params.id)
    const body = await parseBody(req, variantSchema)
    if (!body.ok) return body.response
    const { versionId, snapshot } = await loadPersonality()
    const next = { ...snapshot, variants: [...snapshot.variants.filter((row) => row.jid !== jid && row.jid !== body.data.jid), { ...body.data, origin: "owner" as const }] }
    return ok({ versionId: await writeVersion(next, "edit", getLocalUser().id, versionId) })
})

export const DELETE = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const jid = variantJidParam(params.id)
    const { versionId, snapshot } = await loadPersonality()
    const variants = snapshot.variants.filter((row) => row.jid !== jid)
    // Nada a excluir não grava versão vazia nem finge sucesso.
    if (variants.length === snapshot.variants.length) throw new DomainError(404, "Variante não encontrada", "SECRETARY_VARIANT_NOT_FOUND")
    return ok({ versionId: await writeVersion({ ...snapshot, variants }, "edit", getLocalUser().id, versionId) })
})
