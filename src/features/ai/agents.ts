/**
 * Listas de memórias dos agentes de IA do Opex (módulo PURO: tela e servidor). Copiado do catálogo de
 * agentes do Ciliar: uma lista nova entra aqui e ganha, sem código novo, a API, as ferramentas do
 * Agente Opex (`agent`) e o card na aba de configuração do agente (`tab`).
 *
 * O Agente Opex tem três listas: as **globais** valem no dono e no portal; as **do dono**, só nos
 * turnos do dono; as **do cliente**, só nos turnos do portal (todos os clientes). O **Agente
 * Adversário** tem uma lista própria, que entra nas instruções de toda revisão da mesa. O **agente
 * desenvolvedor** (mesas e forks das centrais) tem as **globais**, que valem em todas as centrais, e
 * uma lista **por central** (`scope: "central"`: cada memória tem `centralId`).
 */

export const AI_AGENT_IDS = ["opex-global", "opex-owner", "opex-client", "adversarial", "developer-global", "developer-central"] as const
export type AiAgentId = (typeof AI_AGENT_IDS)[number]

export interface AiAgentDef {
    label: string
    title: string
    description: string
    tab: string
    /** `central`: uma lista por central de desenvolvimento (a memória exige `centralId`). */
    scope?: "central"
}

export const AI_AGENTS: Record<AiAgentId, AiAgentDef> = {
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
    adversarial: {
        label: "Agente Adversário",
        title: "Memórias do Agente Adversário",
        description: "Instruções permanentes que o Agente Adversário segue em toda revisão da mesa (ex.: \"neste repositório, X é intencional\").",
        tab: "agente-adversario",
    },
    "developer-global": {
        label: "agente desenvolvedor",
        title: "Memórias globais do agente desenvolvedor",
        description: "Instruções permanentes que o agente desenvolvedor segue em todas as centrais: em toda etapa da mesa e nos forks.",
        tab: "desenvolvimento-agentico",
    },
    "developer-central": {
        label: "agente desenvolvedor desta central",
        title: "Memórias da central",
        description: "Instruções permanentes que o agente desenvolvedor segue só nas mesas e forks desta central, depois das globais.",
        tab: "desenvolvimento-agentico",
        scope: "central",
    },
}

/** Listas globais exibidas numa aba de `/integracoes/ia` (cada agente mostra só as suas; as por central ficam na página da central). */
export function aiAgentsOfTab(tab: string): AiAgentId[] {
    return AI_AGENT_IDS.filter((id) => AI_AGENTS[id].tab === tab && !isCentralScopedAgent(id))
}

/** Lista com uma coleção por central (a memória exige `centralId`). */
export function isCentralScopedAgent(agentId: AiAgentId): boolean {
    return AI_AGENTS[agentId].scope === "central"
}

export function isAiAgentId(value: string): value is AiAgentId {
    return (AI_AGENT_IDS as readonly string[]).includes(value)
}

/** Listas de memórias que entram no prompt do Agente Opex, conforme o escopo do turno. */
export function opexMemoryAgentsFor(scope: "owner" | "client"): AiAgentId[] {
    return scope === "owner" ? ["opex-global", "opex-owner"] : ["opex-global", "opex-client"]
}
