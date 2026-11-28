import { BrainCircuit, Rocket } from "lucide-react"
import type { IntegrationTabDef } from "@nandobfer/integracoes/react"
import { AGENT_CATALOG } from "@/features/agent-metrics/catalog"
import type { AiTab } from "./constants"

/**
 * Abas de Integrações › Inteligência Artificial: Provedores e um agente por aba, na ordem, com os nomes
 * (sem "Agente") e os ícones do catálogo de agentes — os mesmos da sidebar (OPE-122).
 */
export const AI_EDITOR_TABS: readonly IntegrationTabDef<AiTab>[] = [
    { id: "provedores", label: "Provedores", icon: BrainCircuit },
    ...AGENT_CATALOG.map((agent) => ({ id: agent.settingsTab, label: agent.navLabel, icon: agent.icon })),
    // Agente de Bootstrap (OPE-215): só a aba, fora do catálogo de agentes (sem item na sidebar nem página própria).
    { id: "agente-bootstrap", label: "Bootstrap", icon: Rocket },
]
