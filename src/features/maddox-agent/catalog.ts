import type { CheckBranch } from "@/lib/check-tree"
import { OPEX_CLIENT_CONTEXT_TOOL, OPEX_CLIENT_TOOLS, buildOpexClientToolTree, opexClientToolsFor, type OpexClientToolMeta } from "@/features/opex-agent/client-tools"
import { buildOpexToolTree, enabledOpexToolNames, type OpexToolMetaDto } from "@/features/opex-agent/tool-tree"
import { MADDOX_MCP_SERVERS, type MaddoxMcpScope } from "./constants"

/**
 * Catálogos de ferramentas do Opex para o Agente Maddox (módulo PURO). O Maddox usa os mesmos
 * catálogos do Agente Opex — o do dono e o do portal —, **sem os jobs agendados** (fora do escopo do
 * Maddox) e sem os MCPs cadastrados no Agente Opex (o Maddox usa os MCPs do próprio OpenCode). As
 * ferramentas chegam ao OpenCode pelo servidor MCP do Opex com o prefixo do servidor
 * (`opex_app_list_tasks`, `opex_portal_list_tasks`).
 */

export const MADDOX_EXCLUDED_GROUPS: readonly string[] = ["jobs"]

const included = (group: string) => !MADDOX_EXCLUDED_GROUPS.includes(group)

/** Ferramentas do dono disponíveis ao Maddox (metadados do registro do Agente Opex). */
export function maddoxOwnerToolMetas(metas: readonly OpexToolMetaDto[]): OpexToolMetaDto[] {
    return metas.filter((tool) => included(tool.group))
}

/** Ferramentas do portal disponíveis ao Maddox. */
export const MADDOX_CLIENT_TOOLS: readonly OpexClientToolMeta[] = OPEX_CLIENT_TOOLS.filter((tool) => included(tool.group))
export const MADDOX_CLIENT_TOOL_NAMES: readonly string[] = MADDOX_CLIENT_TOOLS.map((tool) => tool.name)

/** Ferramentas do portal liberadas ao ator (contexto sempre; admin só para o admin; sem opt-in). */
export function enabledMaddoxClientToolNames(disabledTools: readonly string[], isAdmin: boolean): string[] {
    const disabled = new Set(disabledTools)
    return opexClientToolsFor(isAdmin)
        .filter((tool) => included(tool.group))
        .filter((tool) => tool.name === OPEX_CLIENT_CONTEXT_TOOL || !disabled.has(tool.name))
        .map((tool) => tool.name)
}

/** Ferramentas do dono ligadas no Maddox (o contexto nunca sai). */
export function enabledMaddoxOwnerToolNames(metas: readonly OpexToolMetaDto[], disabledTools: readonly string[]): string[] {
    return enabledOpexToolNames(maddoxOwnerToolMetas(metas), disabledTools)
}

export function buildMaddoxOwnerToolTree(metas: readonly OpexToolMetaDto[]): CheckBranch[] {
    return buildOpexToolTree(maddoxOwnerToolMetas(metas))
}

export function buildMaddoxClientToolTree(): CheckBranch[] {
    return buildOpexClientToolTree().filter((branch) => included(branch.id))
}

/** Nome que o modelo vê no OpenCode: `{servidor}_{ferramenta}` (mesma regra do OpenCode). */
export function maddoxMcpToolName(scope: MaddoxMcpScope, tool: string): string {
    return `${MADDOX_MCP_SERVERS[scope]}_${tool.replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

/** Ferramenta do Opex por trás de um nome do OpenCode (`null` = ferramenta nativa do OpenCode). */
export function parseMaddoxMcpToolName(name: string): { scope: MaddoxMcpScope; tool: string } | null {
    for (const scope of Object.keys(MADDOX_MCP_SERVERS) as MaddoxMcpScope[]) {
        const prefix = `${MADDOX_MCP_SERVERS[scope]}_`
        if (name.startsWith(prefix) && name.length > prefix.length) return { scope, tool: name.slice(prefix.length) }
    }
    return null
}
