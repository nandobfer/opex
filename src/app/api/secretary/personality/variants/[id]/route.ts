import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { variantSchema } from "@/features/secretary-agent/schemas"
import { loadPersonality, writeVersion } from "@/features/secretary-agent/server/personality"

export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, variantSchema)
    if (!body.ok) return body.response
    const { versionId, snapshot } = await loadPersonality()
    const next = { ...snapshot, variants: [...snapshot.variants.filter((row) => row.jid !== params.id && row.jid !== body.data.jid), { ...body.data, origin: "owner" as const }] }
    return ok({ versionId: await writeVersion(next, "edit", getLocalUser().id, versionId) })
})

export const DELETE = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const { versionId, snapshot } = await loadPersonality()
    return ok({ versionId: await writeVersion({ ...snapshot, variants: snapshot.variants.filter((row) => row.jid !== params.id) }, "edit", getLocalUser().id, versionId) })
})
