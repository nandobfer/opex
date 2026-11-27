import { Bot, CodeXml, GraduationCap, Network, Orbit, Repeat, Swords, type LucideIcon } from "lucide-react"

/** Ícones dos agentes do Opex (os mesmos das abas de `/integracoes/ia`), pelo slug do agente no app da instância. */
const OPEX_AGENT_ICONS: Record<string, LucideIcon> = {
    opex: Bot,
    maddox: Orbit,
    adversario: Swords,
    arquiteto: Network,
    desenvolvedor: CodeXml,
    mentor: GraduationCap,
}

/** Agentes rotineiros (`<app>/rotineiro-<slug>`, OPE-130): o ícone da categoria. */
const ROUTINE_AGENT_PREFIX = "rotineiro-"

/** Ícone de um agente (`app/agente`): os do app desta instância (OPE-206) têm ícone próprio; de outros apps, o robô genérico. */
export const agentIconFor =
    (app: string | null) =>
    (agent: string): LucideIcon => {
        const [agentApp, slug] = agent.split("/")
        if (!app || agentApp !== app || !slug) return Bot
        return OPEX_AGENT_ICONS[slug] ?? (slug.startsWith(ROUTINE_AGENT_PREFIX) ? Repeat : Bot)
    }

/** Ícones do app do dono (`opex`), para quem ainda não conhece o app da instância. */
export const agentIcon = agentIconFor("opex")
