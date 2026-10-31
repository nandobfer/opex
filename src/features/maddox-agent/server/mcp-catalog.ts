import { z } from "zod"
import type { OpexTool } from "@/features/opex-agent/server/tools/define"
import { OPEX_TOOL_GROUP_LABELS, type OpexToolGroup } from "@/features/opex-agent/constants"
import { OPEX_CLIENT_TOOL_GROUP_LABELS, type OpexClientToolGroup } from "@/features/opex-agent/client-tools"
import { toolConfirms } from "@/features/opex-agent/tool-tree"
import { MADDOX_CLIENT_TOOL_NAMES, MADDOX_EXCLUDED_GROUPS, maddoxMcpToolName } from "../catalog"
import type { MaddoxMcpScope } from "../constants"
import type { McpToolDescriptor } from "../mcp-protocol"

/**
 * Catálogo do servidor MCP do Opex (SOMENTE servidor): a MESMA lista que o `tools/list` devolve e que a
 * documentação da API interna publica. Os registros entram por import dinâmico (importam serviços
 * pesados e, no grafo estático de uma rota, já quebraram a coleta de dados do `next build`).
 */

export async function maddoxMcpCatalog(scope: MaddoxMcpScope): Promise<OpexTool[]> {
    if (scope === "owner") {
        const { OPEX_TOOLS } = await import("@/features/opex-agent/server/tools/registry")
        return OPEX_TOOLS.filter((tool) => !MADDOX_EXCLUDED_GROUPS.includes(tool.group))
    }
    const { OPEX_CLIENT_SERVER_TOOLS } = await import("@/features/opex-agent/server/client-tools/registry")
    return OPEX_CLIENT_SERVER_TOOLS.filter((tool) => MADDOX_CLIENT_TOOL_NAMES.includes(tool.name))
}

/** Esquema JSON da entrada (o mesmo Zod usado na execução). */
export function toolInputJsonSchema(tool: OpexTool): Record<string, unknown> {
    try {
        const schema = z.toJSONSchema(tool.input, { io: "input", unrepresentable: "any" }) as Record<string, unknown>
        const { $schema: _schema, ...rest } = schema
        void _schema
        return rest.type === "object" ? rest : { type: "object", properties: {} }
    } catch {
        return { type: "object", properties: {}, additionalProperties: true }
    }
}

export function toolDescriptor(tool: OpexTool): McpToolDescriptor {
    return {
        name: tool.name,
        title: tool.label,
        description: tool.description,
        inputSchema: toolInputJsonSchema(tool),
        annotations: { readOnlyHint: tool.risk === "read", destructiveHint: tool.risk === "destructive" },
    }
}

/** Ferramenta documentada: o descritor do `tools/list` + o que a tela de configuração mostra. */
export interface MaddoxMcpToolDoc extends McpToolDescriptor {
    /** Nome visto pelo modelo no OpenCode (`opex_app_*` / `opex_portal_*`). */
    opencodeName: string
    groupLabel: string
    risk: OpexTool["risk"]
    /** Pede confirmação por padrão (o dono pode trocar por ferramenta). */
    confirmsByDefault: boolean
    /** Só o admin do cliente recebe (portal). */
    adminOnly: boolean
}

export type MaddoxMcpDocsCatalog = Record<MaddoxMcpScope, MaddoxMcpToolDoc[]>

function groupLabelOf(scope: MaddoxMcpScope, tool: OpexTool): { label: string; adminOnly: boolean } {
    if (scope === "owner") return { label: OPEX_TOOL_GROUP_LABELS[tool.group as OpexToolGroup]?.label ?? tool.group, adminOnly: false }
    const group = OPEX_CLIENT_TOOL_GROUP_LABELS[tool.group as OpexClientToolGroup]
    return { label: group?.label ?? tool.group, adminOnly: Boolean(tool.adminOnly || group?.adminOnly) }
}

export function toolDoc(scope: MaddoxMcpScope, tool: OpexTool): MaddoxMcpToolDoc {
    const group = groupLabelOf(scope, tool)
    return {
        ...toolDescriptor(tool),
        opencodeName: maddoxMcpToolName(scope, tool.name),
        groupLabel: group.label,
        risk: tool.risk,
        confirmsByDefault: toolConfirms(tool),
        adminOnly: group.adminOnly,
    }
}

/** Catálogo dos dois servidores para a documentação (OpenAPI da API interna). */
export async function maddoxMcpDocsCatalog(): Promise<MaddoxMcpDocsCatalog> {
    const [owner, portal] = await Promise.all([maddoxMcpCatalog("owner"), maddoxMcpCatalog("portal")])
    return { owner: owner.map((tool) => toolDoc("owner", tool)), portal: portal.map((tool) => toolDoc("portal", tool)) }
}
