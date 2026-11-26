import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { SecretaryNotice, secretaryDb } from "@/features/secretary-agent/server/models"
import { contactsByJid } from "@/features/evolution-api/server/contacts"
import { isGroupJid } from "@/features/evolution-api/constants"

export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    await secretaryDb()
    // Em aberto: pendentes e respostas em andamento (inclusive presas por reinício, que podem ser refeitas ou descartadas).
    const [open, recent] = await Promise.all([
        SecretaryNotice.find({ status: { $in: ["pending", "answering"] } }).select("-trigger -ownerRevision").sort({ at: -1 }).lean(),
        SecretaryNotice.find({ status: { $nin: ["pending", "answering"] } }).select("-trigger -ownerRevision").sort({ at: -1 }).limit(100).lean(),
    ])
    const items = [...open, ...recent]
    const jidsByInstance = new Map<string, Set<string>>()
    for (const { instance, jid } of items) {
        const jids = jidsByInstance.get(instance) ?? new Set<string>()
        jids.add(jid)
        jidsByInstance.set(instance, jids)
    }
    const contacts = new Map(await Promise.all([...jidsByInstance].map(async ([instance, jids]) => [instance, await contactsByJid([...jids], instance)] as const)))
    return ok({ pending: open.filter((item) => item.status === "pending").length, items: items.map((item) => {
        const { jid } = item
        const isGroup = isGroupJid(jid)
        const number = jid.split("@")[0] ?? jid
        const contact = contacts.get(item.instance)?.get(jid) ?? { jid, number, isGroup, name: item.contactName || (isGroup ? `Grupo ${number}` : number), pictureUrl: null, lastMessageAt: null }
        return { _id: item._id, kind: item.kind, status: item.status, text: item.text, answer: item.answer, memoryChannel: item.memoryChannel, at: item.at, contact, author: item.author, excerpt: item.excerpt }
    }) })
})
