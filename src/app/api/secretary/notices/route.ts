import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { SecretaryNotice, secretaryDb } from "@/features/secretary-agent/server/models"

export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    await secretaryDb()
    // Em aberto: pendentes e respostas em andamento (inclusive presas por reinício, que podem ser refeitas ou descartadas).
    const [open, recent] = await Promise.all([
        SecretaryNotice.find({ status: { $in: ["pending", "answering"] } }).select("-trigger -ownerRevision").sort({ at: -1 }).lean(),
        SecretaryNotice.find({ status: { $nin: ["pending", "answering"] } }).select("-trigger -ownerRevision").sort({ at: -1 }).limit(100).lean(),
    ])
    return ok({ pending: open.filter((item) => item.status === "pending").length, items: [...open, ...recent] })
})
