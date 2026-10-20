/**
 * Listas de memórias dos agentes de IA do Opex (módulo PURO: tela e servidor). Copiado do catálogo de
 * agentes do Ciliar: uma lista nova entra aqui e ganha, sem código novo, a API, as ferramentas do
 * Agente Opex (`agent`) e o card na aba Memórias.
 *
 * O Agente Opex tem três listas: as **globais** valem no dono e no portal; as **do dono**, só nos
 * turnos do dono; as **do cliente**, só nos turnos do portal (todos os clientes).
 */

export const AI_AGENT_IDS = ["opex-global", "opex-owner", "opex-client"] as const
export type AiAgentId = (typeof AI_AGENT_IDS)[number]

export const AI_AGENTS: Record<AiAgentId, { label: string; title: string; description: string; tab: string }> = {
    "opex-global": {
        label: "Agente Opex (global)",
        title: "Memórias globais",
        description: "Instruções permanentes que o Agente Opex segue em toda conversa, no app do dono e no portal do cliente.",
        tab: "agente-opex",
    },
    "opex-owner": {
        label: "Agente Opex do dono",
        title: "Memórias do dono",
        description: "Instruções permanentes que o Agente Opex segue só nas conversas do dono.",
        tab: "agente-opex",
    },
    "opex-client": {
        label: "Agente Opex do portal",
        title: "Memórias do cliente",
        description: "Instruções permanentes que o Agente Opex segue só nas conversas do portal do cliente (todos os clientes).",
        tab: "agente-opex",
    },
}

export function isAiAgentId(value: string): value is AiAgentId {
    return (AI_AGENT_IDS as readonly string[]).includes(value)
}

/** Listas de memórias que entram no prompt do Agente Opex, conforme o escopo do turno. */
export function opexMemoryAgentsFor(scope: "owner" | "client"): AiAgentId[] {
    return scope === "owner" ? ["opex-global", "opex-owner"] : ["opex-global", "opex-client"]
}
