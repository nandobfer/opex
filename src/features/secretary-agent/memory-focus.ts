import { isConversationId, memoryChannelOf, type ChannelNamespace } from "@/features/ai/agents"

/** Parâmetro da URL que abre as memórias de uma conversa (ação "abrir as memórias" da aba Conversas). */
export const CONVERSATION_PARAM = "conversa"

/** Canais (reais) do universo focado numa conversa: o global do Secretário e o canal dela (puro). */
export function conversationFocus(conversationId: string | null | undefined, ns: ChannelNamespace): { channels: string[]; defaultCreateChannel: string } | null {
    if (!isConversationId(conversationId)) return null
    const channel = memoryChannelOf("secretary-conversation", { conversationId }, ns)
    const global = memoryChannelOf("secretary-global", {}, ns)
    return channel && global ? { channels: [global, channel], defaultCreateChannel: channel } : null
}
