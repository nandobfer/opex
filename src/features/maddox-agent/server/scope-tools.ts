import { DomainError } from "@/lib/api/route"
import type { OpexServerScope } from "@/features/opex-agent/server/scope"
import { MADDOX_CLIENT_TOOLS, enabledMaddoxOwnerToolNames } from "../catalog"
import { maddoxSessionPermissions, type MaddoxPermissionRule } from "../permissions"
import type { MaddoxAgentSettings } from "../schemas"
import { assertClientMaddoxToolAllowed, enabledMaddoxClientToolNamesFor } from "./client-config"
import { maddoxToolMetas } from "./settings"
import { MADDOX_MCP_REFUSALS } from "../mcp-protocol"

/**
 * Ferramentas do Opex no escopo de uma sessão do Maddox (SOMENTE servidor): as regras de permissão da
 * sessão do OpenCode (montadas a cada turno) e a conferência de acesso imediatamente antes de cada
 * chamada pelo servidor MCP.
 */

export async function maddoxPermissionsFor(scope: OpexServerScope, settings: MaddoxAgentSettings): Promise<MaddoxPermissionRule[]> {
    if (scope.kind === "owner") {
        const metas = await maddoxToolMetas()
        return maddoxSessionPermissions({ scope: "owner", tools: metas, enabled: new Set(enabledMaddoxOwnerToolNames(metas, settings.disabledTools)), overrides: settings.confirmationOverrides })
    }
    const names = await enabledMaddoxClientToolNamesFor(scope.actor)
    return maddoxSessionPermissions({ scope: "portal", tools: MADDOX_CLIENT_TOOLS, enabled: new Set(names) })
}

/**
 * Confere de novo, antes de executar, se a ferramenta está liberada para o escopo da sessão. No portal
 * relê o vínculo, o papel, o cliente e a configuração (desligar no meio do turno vale na hora) e
 * devolve o escopo com o ator atual.
 */
export async function authorizeMaddoxTool(toolName: string, scope: OpexServerScope, settings: MaddoxAgentSettings): Promise<OpexServerScope> {
    if (scope.kind === "client") {
        const actor = await assertClientMaddoxToolAllowed(toolName, scope.actor)
        return { ...scope, actor }
    }
    const metas = await maddoxToolMetas()
    if (!enabledMaddoxOwnerToolNames(metas, settings.disabledTools).includes(toolName)) throw new DomainError(403, MADDOX_MCP_REFUSALS.toolDisabled, "MADDOX_TOOL_DISABLED")
    return scope
}
