import { AGENT_SECTION_PARAM } from "@/features/ai/components/AgentSettingsTabs"
import type { SecretarySection } from "./constants"

/** Aba do Agente Secretário em Integrações › IA (as seções são `?secao=`, não rotas próprias). */
export const SECRETARY_TAB_PATH = "/integracoes/ia?aba=agente-secretario"

/** Link de uma seção do Secretário, com parâmetros extras (ex.: `conversa`). Só para telas (cliente). */
export function secretarySectionPath(section: SecretarySection, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams({ [AGENT_SECTION_PARAM]: section, ...extra })
    return `${SECRETARY_TAB_PATH}&${params.toString()}`
}
