import { Bot, CodeXml, GraduationCap, Orbit, Swords, type LucideIcon } from "lucide-react"

/** Ícones dos agentes do Opex (os mesmos das abas de `/integracoes/ia`); de outros apps, o robô genérico. */
const OPEX_AGENT_ICONS: Record<string, LucideIcon> = {
    "opex/opex": Bot,
    "opex/maddox": Orbit,
    "opex/adversario": Swords,
    "opex/desenvolvedor": CodeXml,
    "opex/mentor": GraduationCap,
}

export const agentIcon = (agent: string): LucideIcon => OPEX_AGENT_ICONS[agent] ?? Bot
