import type { OpexTool } from "../tools/define"
import { clientContextTools } from "./context"
import { clientDashboardTools, clientFinanceTools } from "./dashboard"
import { clientFileTools, clientPreviewTools } from "./previews"
import { clientTaskTools } from "./tasks"
import { clientUserTools } from "./users"

/**
 * Catálogo executável do Agente Opex no portal. Todas as ferramentas chamam os serviços do portal e
 * exigem o escopo do cliente (o ator é conferido no banco). A seleção do dono filtra este conjunto
 * pelo nome; as de admin só entram quando o usuário é admin do cliente.
 */
export const OPEX_CLIENT_SERVER_TOOLS: readonly OpexTool[] = [
    ...clientContextTools,
    ...clientTaskTools,
    ...clientPreviewTools,
    ...clientFileTools,
    ...clientDashboardTools,
    ...clientFinanceTools,
    ...clientUserTools,
] as readonly OpexTool[]

export function findOpexClientServerTool(name: string): OpexTool | undefined {
    return OPEX_CLIENT_SERVER_TOOLS.find((tool) => tool.name === name)
}

/** Ferramentas liberadas pelos nomes configurados para o cliente (contexto sempre). */
export function enabledClientOpexServerTools(names: readonly string[], isAdmin: boolean): OpexTool[] {
    const allowed = new Set(names)
    return OPEX_CLIENT_SERVER_TOOLS.filter((tool) => (!tool.adminOnly || isAdmin) && (tool.group === "context" || allowed.has(tool.name)))
}
