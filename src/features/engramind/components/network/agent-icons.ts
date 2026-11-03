import { createElement } from "react"
import { Bot, CodeXml, GraduationCap, Network, Orbit, Swords, type LucideIcon } from "lucide-react"

/** Ícones dos agentes do Opex (os mesmos das abas de `/integracoes/ia`); de outros apps, o robô genérico. */
const OPEX_AGENT_ICONS: Record<string, LucideIcon> = {
    "opex/opex": Bot,
    "opex/maddox": Orbit,
    "opex/adversario": Swords,
    "opex/arquiteto": Network,
    "opex/desenvolvedor": CodeXml,
    "opex/mentor": GraduationCap,
}

export const agentIcon = (agent: string): LucideIcon => OPEX_AGENT_ICONS[agent] ?? Bot

/** Ícone do agente como elemento (sem criar componente durante o render). */
export const AgentIcon = ({ agent, className }: { agent: string; className?: string }) => createElement(agentIcon(agent), { className, "aria-hidden": true })
