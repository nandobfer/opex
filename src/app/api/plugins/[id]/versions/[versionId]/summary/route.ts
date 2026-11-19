import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { generateVersionChangeSummary } from "@/features/plugins/server/version-summary"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/plugins/[id]/versions/[versionId]/summary — gera com IA o descritivo da mudança da versão. */
export const POST = withRoute<{ id: string; versionId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await generateVersionChangeSummary(params.id, params.versionId, getLocalUser().id))
})
