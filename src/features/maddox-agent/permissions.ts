import { toolConfirms } from "@/features/opex-agent/tool-tree"
import { maddoxMcpToolName } from "./catalog"
import { MADDOX_MCP_SERVERS, type MaddoxMcpScope } from "./constants"

/**
 * Regras de permissão da sessão do OpenCode do Agente Maddox (módulo PURO). As ferramentas do Opex
 * chegam por MCP e o OpenCode confere cada chamada contra as regras da sessão (ação = nome que o modelo
 * vê, `opex_app_list_tasks`):
 * - o servidor MCP do **outro** escopo é negado inteiro (o dono não usa o catálogo do portal e vice-versa);
 * - ferramenta desligada → `deny` (some no turno seguinte; o servidor MCP também recusa);
 * - ferramenta que pede confirmação → `ask` (o chat mostra Confirmar/Cancelar);
 * - demais → `allow`.
 * As ferramentas nativas do OpenCode não recebem regra: seguem as permissões do próprio OpenCode.
 */

export interface MaddoxPermissionRule {
    action: string
    resource: string
    effect: "allow" | "deny" | "ask"
}

export interface MaddoxCatalogTool {
    name: string
    risk: "read" | "write" | "destructive"
    confirmByDefault?: boolean
}

export interface MaddoxPermissionInput {
    scope: MaddoxMcpScope
    /** Catálogo inteiro do servidor MCP do escopo. */
    tools: readonly MaddoxCatalogTool[]
    /** Ferramentas ligadas agora (configuração + papel). */
    enabled: ReadonlySet<string>
    /** Ajuste do "Pede confirmação" (só no dono; no portal vale o padrão pelo risco). */
    overrides?: Readonly<Record<string, boolean>>
}

export function maddoxSessionPermissions({ scope, tools, enabled, overrides = {} }: MaddoxPermissionInput): MaddoxPermissionRule[] {
    const other: MaddoxMcpScope = scope === "owner" ? "portal" : "owner"
    const rules: MaddoxPermissionRule[] = [{ action: `${MADDOX_MCP_SERVERS[other]}_*`, resource: "*", effect: "deny" }]
    for (const tool of tools) {
        const action = maddoxMcpToolName(scope, tool.name)
        const effect = !enabled.has(tool.name) ? "deny" : toolConfirms(tool, overrides) ? "ask" : "allow"
        rules.push({ action, resource: "*", effect })
    }
    return rules
}
