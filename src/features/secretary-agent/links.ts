import { AGENT_SECTION_PARAM } from "@/features/ai/components/AgentSettingsTabs"
import { agentDef } from "@/features/agent-metrics/catalog"
import type { SecretarySection } from "./constants"

/** Aba do Agente Secretário em Integrações › IA (as seções são `?secao=`, não rotas próprias). */
export const SECRETARY_TAB_PATH = "/integracoes/ia?aba=agente-secretario"

/** Link de uma seção do Secretário, com parâmetros extras (ex.: `conversa`). Só para telas (cliente). */
export function secretarySectionPath(section: SecretarySection, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams({ [AGENT_SECTION_PARAM]: section, ...extra })
    return `${SECRETARY_TAB_PATH}&${params.toString()}`
}

/** Página do agente (`/agente-secretario`), do catálogo dos agentes. */
export const SECRETARY_PAGE_PATH = agentDef("secretario").href

/** Abas próprias da página do agente (`?aba=`; Conversas é a padrão, OPE-207). */
export const SECRETARY_PAGE_TABS = { conversas: "conversas", memorias: "memorias" } as const
export type SecretaryPageTab = (typeof SECRETARY_PAGE_TABS)[keyof typeof SECRETARY_PAGE_TABS]

/** Link de uma aba da página do agente, com parâmetros extras; a aba padrão (Conversas) fica fora da URL. */
export function secretaryPagePath(tab: SecretaryPageTab, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams({ ...(tab === SECRETARY_PAGE_TABS.conversas ? {} : { aba: tab }), ...extra })
    const query = params.toString()
    return query ? `${SECRETARY_PAGE_PATH}?${query}` : SECRETARY_PAGE_PATH
}
