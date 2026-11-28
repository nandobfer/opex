import { AGENT_SECTION_PARAM } from "@/features/ai/components/AgentSettingsTabs"
import { PROJECT_BOOTSTRAP_SETTINGS_HREF } from "./constants"

/** Seções da aba Agente de Bootstrap em Integrações › IA (`?secao=`, não rotas próprias). */
export const PROJECT_BOOTSTRAP_SECTIONS = ["configuracao", "skills", "catalogo", "historico"] as const
export type ProjectBootstrapSection = (typeof PROJECT_BOOTSTRAP_SECTIONS)[number]

/** Link de uma seção da aba do Agente de Bootstrap. Só para telas (cliente). */
export function projectBootstrapSectionPath(section: ProjectBootstrapSection): string {
    return `${PROJECT_BOOTSTRAP_SETTINGS_HREF}&${new URLSearchParams({ [AGENT_SECTION_PARAM]: section }).toString()}`
}
