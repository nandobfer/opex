import type { OpexToolGroup } from "../../constants"
import { isAlwaysOnGroup, toolConfirms, type OpexToolMetaDto } from "../../tool-tree"
import type { OpexTool } from "./define"
import { centralTools } from "./centrals"
import { clientTools } from "./clients"
import { contextTools } from "./context"
import { docTools } from "./docs"
import { environmentTools } from "./environments"
import { fileTools } from "./files"
import { githubTools } from "./github"
import { hostTools } from "./host"
import { financeTools } from "./finance"
import { integrationTools } from "./integrations"
import { issueTools } from "./issues"
import { jobTools } from "./jobs"
import { mcpTools } from "./mcp"
import { memoryTools } from "./memories"
import { opencodeResourceTools, opencodeServiceTools } from "./opencode"
import { aiSettingsTools, dashboardTools, prReviewTools } from "./misc"
import { previewTools } from "./previews"
import { serviceTools } from "./services"
import { taskTools } from "./tasks"
import { timeTools } from "./time"
import { workbenchTools } from "./workbenches"

/** Todas as ferramentas do Agente Opex (nomes únicos; o modelo as vê pelo nome). */
export const OPEX_TOOLS: readonly OpexTool[] = [
    ...contextTools,
    ...docTools,
    ...fileTools,
    ...memoryTools,
    ...taskTools,
    ...previewTools,
    ...timeTools,
    ...workbenchTools,
    ...centralTools,
    ...githubTools,
    ...issueTools,
    ...integrationTools,
    ...jobTools,
    ...aiSettingsTools,
    ...prReviewTools,
    ...dashboardTools,
    ...serviceTools,
    ...financeTools,
    ...clientTools,
    ...hostTools,
    ...environmentTools,
    ...opencodeServiceTools,
    ...opencodeResourceTools,
    ...mcpTools,
] as readonly OpexTool[]

export function findOpexTool(name: string): OpexTool | undefined {
    return OPEX_TOOLS.find((tool) => tool.name === name)
}

/** Metadados exibidos na configuração (sem a entrada nem a execução). */
export function opexToolMetas(): OpexToolMetaDto[] {
    return OPEX_TOOLS.map((tool) => ({
        name: tool.name,
        group: tool.group as OpexToolGroup,
        label: tool.label,
        description: tool.description,
        risk: tool.risk,
        ...(tool.confirmByDefault ? { confirmByDefault: true } : {}),
        alwaysOn: isAlwaysOnGroup(tool.group),
    }))
}

/** Ferramentas ligadas: todas menos as desligadas na configuração (o grupo Contexto fica sempre disponível). */
export function enabledOpexTools(disabledTools: readonly string[]): OpexTool[] {
    const disabled = new Set(disabledTools)
    return OPEX_TOOLS.filter((tool) => isAlwaysOnGroup(tool.group) || !disabled.has(tool.name))
}

/** Pede Confirmar/Cancelar? Ajuste da ferramenta; sem ajuste, as destrutivas e as `confirmByDefault`. */
export function needsConfirmation(tool: OpexTool, overrides: Readonly<Record<string, boolean>> = {}): boolean {
    return toolConfirms(tool, overrides)
}
