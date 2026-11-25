import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { SecretaryDecisionRecord, secretaryDb } from "@/features/secretary-agent/server/models"

export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    await secretaryDb()
    const jid = req.nextUrl.searchParams.get("jid")
    return ok(await SecretaryDecisionRecord.find(jid ? { jid } : {}).sort({ at: -1 }).limit(100).lean())
})
