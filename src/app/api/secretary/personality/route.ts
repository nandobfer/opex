import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { personalitySchema } from "@/features/secretary-agent/schemas"
import { listPersonalityVersions, loadPersonality, writeVersion } from "@/features/secretary-agent/server/personality"

export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok({ ...await loadPersonality(), versions: await listPersonalityVersions() })
})

export const PUT = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, personalitySchema)
    if (!body.ok) return body.response
    const { versionId, snapshot } = await loadPersonality()
    return ok({ versionId: await writeVersion({ ...snapshot, base: body.data }, "edit", getLocalUser().id, versionId) })
})
