import { Bot, Calculator, CodeXml, GitPullRequest, GraduationCap, Orbit, Repeat, Swords, Tags, Wand2, type LucideIcon } from "lucide-react"
import type { AiTab } from "@/features/ai/constants"
import { ARCHITECT_ICON } from "@/features/architect-agent/components/icons"

/**
 * Catálogo dos agentes de IA do Opex (módulo puro, OPE-122). Fonte única da categoria **Agentes** da
 * sidebar, das abas de Integrações › Inteligência Artificial (depois de Provedores) e do cabeçalho
 * da página de cada agente. A ordem segue o fluxo de trabalho. `navLabel` (sidebar e aba) não leva a
 * palavra "Agente"; o título da página leva.
 */

export const AGENT_IDS = ["opex", "maddox", "orcamentista", "catalogador", "refinador", "desenvolvedor", "arquiteto", "adversario", "revisor", "mentor", "rotineiros"] as const
export type AgentId = (typeof AGENT_IDS)[number]

export interface AgentDef {
    id: AgentId
    /** Nome na sidebar e na aba de configuração (sem "Agente"). */
    navLabel: string
    /** Título do cabeçalho da página ("Agente X"). */
    title: string
    description: string
    icon: LucideIcon
    /** Página do agente. */
    href: string
    /** Aba do agente em `/integracoes/ia`. */
    settingsTab: AiTab
    /** Filtros da Visão geral que se aplicam ao agente (os demais ficam ocultos). */
    filters: { client: boolean; repo: boolean }
    /** Página nova (OPE-122): tem a aba Histórico. As antigas mantêm as listas atuais. */
    hasHistory: boolean
    /** Aba Memórias (agentes com lista de memórias). */
    hasMemories: boolean
}

export const AGENT_CATALOG: readonly AgentDef[] = [
    {
        id: "opex",
        navLabel: "Opex",
        title: "Agente Opex",
        description: "Conversas do assistente do app, do dono e do portal, com ferramentas, confirmações e tokens. Atualiza em tempo real.",
        icon: Bot,
        href: "/agente-opex",
        settingsTab: "agente-opex",
        filters: { client: true, repo: false },
        hasHistory: true,
        hasMemories: true,
    },
    {
        id: "maddox",
        navLabel: "Maddox",
        title: "Agente Maddox",
        description: "Conversas do agente Maddox, do dono e do portal, com ferramentas, confirmações e tokens. Atualiza em tempo real.",
        icon: Orbit,
        href: "/agente-maddox",
        settingsTab: "agente-maddox",
        filters: { client: true, repo: false },
        hasHistory: true,
        hasMemories: true,
    },
    {
        id: "orcamentista",
        navLabel: "Orçamentista",
        title: "Agente Orçamentista",
        description: "Prévias de orçamento e estimativas de horas, comparadas às horas reais apontadas. Atualiza em tempo real.",
        icon: Calculator,
        href: "/agente-orcamentista",
        settingsTab: "orcamentista",
        filters: { client: true, repo: true },
        hasHistory: true,
        hasMemories: false,
    },
    {
        id: "catalogador",
        navLabel: "Catalogador",
        title: "Agente Catalogador",
        description: "Resumos e tags das tarefas: cobertura, tags mais usadas e falhas. Atualiza em tempo real.",
        icon: Tags,
        href: "/agente-catalogador",
        settingsTab: "catalogador",
        filters: { client: true, repo: true },
        hasHistory: true,
        hasMemories: false,
    },
    {
        id: "refinador",
        navLabel: "Refinador",
        title: "Agente Refinador",
        description: "Refinamentos das tarefas: conclusão, perguntas e tempo até a especificação. Atualiza em tempo real.",
        icon: Wand2,
        href: "/agente-refinador",
        settingsTab: "refinar-tarefa",
        filters: { client: true, repo: true },
        hasHistory: true,
        hasMemories: false,
    },
    {
        id: "desenvolvedor",
        navLabel: "Desenvolvedor",
        title: "Agente Desenvolvedor",
        description: "Mesas de trabalho das centrais: regressão, bloqueios, one shot, conflitos, CI e tempo por etapa. Atualiza em tempo real.",
        icon: CodeXml,
        href: "/agente-desenvolvedor",
        settingsTab: "desenvolvimento-agentico",
        filters: { client: true, repo: true },
        hasHistory: true,
        hasMemories: true,
    },
    {
        id: "arquiteto",
        navLabel: "Arquiteto",
        title: "Agente Arquiteto",
        description: "Versões dos diagramas das mesas: tamanho e duração da geração. Atualiza em tempo real.",
        icon: ARCHITECT_ICON,
        href: "/agente-arquiteto",
        settingsTab: "agente-arquiteto",
        filters: { client: true, repo: true },
        hasHistory: true,
        hasMemories: true,
    },
    {
        id: "adversario",
        navLabel: "Adversário",
        title: "Agente Adversário",
        description: "Revisões do código das mesas antes da prévia ou do PR, e as memórias do agente. Atualiza em tempo real.",
        icon: Swords,
        href: "/agente-adversario",
        settingsTab: "agente-adversario",
        filters: { client: true, repo: true },
        hasHistory: false,
        hasMemories: true,
    },
    {
        id: "revisor",
        navLabel: "Revisor",
        title: "Agente Revisor",
        description: "Revisões dos PRs das centrais. Atualiza em tempo real.",
        icon: GitPullRequest,
        href: "/agente-revisor",
        settingsTab: "revisao-pr",
        filters: { client: true, repo: true },
        hasHistory: false,
        hasMemories: false,
    },
    {
        id: "mentor",
        navLabel: "Mentor",
        title: "Agente Mentor",
        description: "Avaliações dos turnos das mesas que viram memórias dos agentes. Atualiza em tempo real.",
        icon: GraduationCap,
        href: "/agente-mentor",
        settingsTab: "agente-mentor",
        filters: { client: true, repo: true },
        hasHistory: false,
        hasMemories: false,
    },
    {
        // OPE-130: um item para todos os agentes rotineiros; a página lista os agentes e cada um tem a sua.
        id: "rotineiros",
        navLabel: "Rotineiros",
        title: "Agentes rotineiros",
        description: "Agentes autônomos configuráveis que executam sozinhos, esperam, hibernam e pedem confirmação antes de ações irreversíveis. Atualiza em tempo real.",
        icon: Repeat,
        href: "/agentes-rotineiros",
        settingsTab: "rotineiros",
        filters: { client: false, repo: false },
        hasHistory: false,
        hasMemories: true,
    },
]

const BY_ID = new Map(AGENT_CATALOG.map((agent) => [agent.id, agent]))

export function agentDef(id: AgentId): AgentDef {
    return BY_ID.get(id)!
}

export function isAgentId(value: string): value is AgentId {
    return BY_ID.has(value as AgentId)
}

/** Atalho "Configurar": aba do agente em Integrações › Inteligência Artificial. */
export function agentSettingsHref(id: AgentId): string {
    return `/integracoes/ia?aba=${agentDef(id).settingsTab}`
}
