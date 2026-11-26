import { publishAppEvent } from "@/lib/pusher/channels"
import { SECRETARY_CHAT_EVENT } from "../constants"
import { conversationIdOfJid } from "../conversation-id"
import { loadSecretarySettings } from "./settings"

/**
 * Mensagem nova, atualizada ou não lidas de conversas da instância do Secretário (aba Conversas, OPE-197): publica
 * `secretary-chat-updated` com `{ chatId }` só (sem texto). Outras instâncias não publicam.
 */
export async function publishSecretaryChatUpdated(instance: string, jids: readonly string[]): Promise<void> {
    const { settings } = await loadSecretarySettings()
    if (!settings.instance || settings.instance !== instance) return
    const chatIds = new Set(jids.map(conversationIdOfJid).filter((id): id is string => Boolean(id)))
    for (const chatId of chatIds) await publishAppEvent(SECRETARY_CHAT_EVENT, { chatId })
}
