import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { personalitySaveSchema } from "@/features/secretary-agent/schemas"
import { listPersonalityVersions, loadPersonality, saveBasePersonality } from "@/features/secretary-agent/server/personality"

export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok({ ...await loadPersonality(), versions: await listPersonalityVersions() })
})

export const PUT = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, personalitySaveSchema)
    if (!body.ok) return body.response
    return ok({ versionId: await saveBasePersonality(body.data, getLocalUser().id) })
})
