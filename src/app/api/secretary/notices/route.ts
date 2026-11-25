import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { SecretaryNotice, secretaryDb } from "@/features/secretary-agent/server/models"

export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    await secretaryDb()
    const [pending, recent] = await Promise.all([
        SecretaryNotice.find({ status: "pending" }).select("-trigger -ownerRevision").sort({ at: -1 }).lean(),
        SecretaryNotice.find({ status: { $ne: "pending" } }).select("-trigger -ownerRevision").sort({ at: -1 }).limit(100).lean(),
    ])
    return ok({ pending: pending.length, items: [...pending, ...recent] })
})
