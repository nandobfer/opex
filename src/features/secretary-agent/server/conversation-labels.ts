import { contactsByJid } from "@/features/evolution-api/server/contacts"
import { jidOfConversationId } from "../conversation-id"

export async function conversationLabel(id: string): Promise<string | null> {
    const jid = jidOfConversationId(id)
    return jid ? (await contactsByJid([jid])).get(jid)?.name ?? null : null
}
