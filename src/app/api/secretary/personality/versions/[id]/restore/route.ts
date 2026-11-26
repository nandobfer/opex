import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { restoreVersion } from "@/features/secretary-agent/server/personality"

export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok({ versionId: await restoreVersion(params.id, getLocalUser().id) })
})
