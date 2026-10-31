import { OPEX_TOOL_GROUP_LABELS, type OpexToolGroup } from "@/features/opex-agent/constants"
import { PUBLIC_TOKEN_ROUTES } from "@/features/public-api/routes"
import { isTokenGrantableTool } from "./scopes"
import type { ApiTokenScopeCatalogDto } from "./types"

/**
 * Catálogo de escopos que um token pode receber (SOMENTE servidor): as rotas públicas e as
 * ferramentas do MCP do dono (as mesmas do Maddox, sem os grupos fora do token). O registro de
 * ferramentas entra por import dinâmico (serviços pesados).
 */
export async function apiTokenScopeCatalog(): Promise<ApiTokenScopeCatalogDto> {
    const { maddoxToolMetas } = await import("@/features/maddox-agent/server/settings")
    const tools = (await maddoxToolMetas()).filter(isTokenGrantableTool)
    const groupIds = [...new Set(tools.map((tool) => tool.group))]
    return {
        routes: PUBLIC_TOKEN_ROUTES.map((route) => ({ method: route.method, path: route.path, scope: route.scope, summary: route.summary })),
        groups: groupIds.map((id) => {
            const meta = OPEX_TOOL_GROUP_LABELS[id as OpexToolGroup]
            return { id, label: meta?.label ?? id, description: meta?.description ?? "" }
        }),
        tools,
    }
}
