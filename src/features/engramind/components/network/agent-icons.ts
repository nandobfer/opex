import { Bot, CodeXml, GraduationCap, Network, Orbit, Repeat, Swords, type LucideIcon } from "lucide-react"

/** Ícones dos agentes do Opex (os mesmos das abas de `/integracoes/ia`); de outros apps, o robô genérico. */
const OPEX_AGENT_ICONS: Record<string, LucideIcon> = {
    "opex/opex": Bot,
    "opex/maddox": Orbit,
    "opex/adversario": Swords,
    "opex/arquiteto": Network,
    "opex/desenvolvedor": CodeXml,
    "opex/mentor": GraduationCap,
}

/** Agentes rotineiros (`opex/rotineiro-<slug>`, OPE-130): o ícone da categoria. */
const ROUTINE_AGENT_PREFIX = "opex/rotineiro-"

export const agentIcon = (agent: string): LucideIcon => OPEX_AGENT_ICONS[agent] ?? (agent.startsWith(ROUTINE_AGENT_PREFIX) ? Repeat : Bot)
