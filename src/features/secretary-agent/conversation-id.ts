import { isConversationId } from "@/features/ai/agents"
import { GROUP_JID_SUFFIX, LID_JID_SUFFIX, USER_JID_SUFFIX } from "@/features/evolution-api/constants"

/**
 * Id da conversa do Agente Secretário (puro): o canal de memórias `agentes/secretario/conversas/<id>`, as
 * variantes de personalidade e o estado da conversa usam o mesmo id.
 * - contato: os dígitos do número (`5531999999999@s.whatsapp.net` → `5531999999999`);
 * - grupo: `g-<id do grupo>` (`120363…@g.us` → `g-120363…`; antigos `5531…-1600…@g.us` → `g-5531…-1600…`);
 * - contato só com `@lid`: `lid-<dígitos>`.
 */
export function conversationIdOfJid(jid: string): string | null {
    const [rawUser, server] = jid.split("@")
    const user = rawUser?.split(":")[0] ?? ""
    let id: string | null = null
    if (`@${server}` === GROUP_JID_SUFFIX) id = /^[0-9]+(?:-[0-9]+)?$/.test(user) ? `g-${user}` : null
    else if (`@${server}` === USER_JID_SUFFIX) id = /^[0-9]+$/.test(user) ? user : null
    else if (`@${server}` === LID_JID_SUFFIX) id = /^[0-9]+$/.test(user) ? `lid-${user}` : null
    return id && isConversationId(id) ? id : null
}

/** JID de volta a partir do id (inverso de `conversationIdOfJid`). */
export function jidOfConversationId(id: string): string | null {
    if (!isConversationId(id)) return null
    if (id.startsWith("g-")) return `${id.slice(2)}${GROUP_JID_SUFFIX}`
    if (id.startsWith("lid-")) return `${id.slice(4)}${LID_JID_SUFFIX}`
    return `${id}${USER_JID_SUFFIX}`
}
