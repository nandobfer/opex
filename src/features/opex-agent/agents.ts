/**
 * Agentes de chat do item único da barra lateral (módulo PURO): o **Agente Opex** e o **Agente Maddox**
 * dividem o mesmo item e o mesmo popover; o usuário troca entre eles no cabeçalho, e o último escolhido
 * fica guardado no navegador.
 */

export const CHAT_AGENT_IDS = ["opex", "maddox"] as const
export type ChatAgentId = (typeof CHAT_AGENT_IDS)[number]

export function isChatAgentId(value: unknown): value is ChatAgentId {
    return typeof value === "string" && (CHAT_AGENT_IDS as readonly string[]).includes(value)
}

/** Chave do agente ativo: por cliente e usuário no portal; a do dono é a base. */
export const ACTIVE_AGENT_STORAGE_KEY = "opex:chat-agent:active:v1"

export function activeAgentStorageKey(clientId: string | null, userId: string | null): string {
    return clientId && userId ? `${ACTIVE_AGENT_STORAGE_KEY}:${clientId}:${userId}` : ACTIVE_AGENT_STORAGE_KEY
}

/**
 * Agente aberto pelo item: o último escolhido, se ainda estiver disponível; senão o primeiro disponível
 * (Opex antes do Maddox). `null` = nenhum agente disponível (o item não aparece no portal).
 */
export function resolveActiveAgent(stored: ChatAgentId | null | undefined, available: readonly ChatAgentId[]): ChatAgentId | null {
    if (stored && available.includes(stored)) return stored
    return CHAT_AGENT_IDS.find((id) => available.includes(id)) ?? null
}

/** O outro agente disponível (o do botão apagado do cabeçalho); `null` com um agente só. */
export function otherAgent(active: ChatAgentId | null, available: readonly ChatAgentId[]): ChatAgentId | null {
    if (!active) return null
    return available.find((id) => id !== active) ?? null
}
