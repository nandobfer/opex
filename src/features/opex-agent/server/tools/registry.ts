import type { OpexConfirmationPolicy, OpexToolGroup } from "../../constants"
import type { OpexTool } from "./define"
import { centralTools } from "./centrals"
import { clientTools } from "./clients"
import { contextTools } from "./context"
import { fileTools } from "./files"
import { financeTools } from "./finance"
import { integrationTools } from "./integrations"
import { aiSettingsTools, dashboardTools, prReviewTools } from "./misc"
import { previewTools } from "./previews"
import { serviceTools } from "./services"
import { taskTools } from "./tasks"
import { timeTools } from "./time"
import { workbenchTools } from "./workbenches"

/** Todas as ferramentas do Agente Opex (nomes únicos; o modelo as vê pelo nome). */
export const OPEX_TOOLS: readonly OpexTool[] = [
    ...contextTools,
    ...fileTools,
    ...taskTools,
    ...previewTools,
    ...timeTools,
    ...workbenchTools,
    ...centralTools,
    ...integrationTools,
    ...aiSettingsTools,
    ...prReviewTools,
    ...dashboardTools,
    ...serviceTools,
    ...financeTools,
    ...clientTools,
] as readonly OpexTool[]

export function findOpexTool(name: string): OpexTool | undefined {
    return OPEX_TOOLS.find((tool) => tool.name === name)
}

/** Ferramentas dos grupos ligados (o grupo Contexto fica sempre disponível). */
export function enabledOpexTools(groups: Record<OpexToolGroup, boolean>): OpexTool[] {
    return OPEX_TOOLS.filter((tool) => tool.group === "context" || groups[tool.group] !== false)
}

export function needsConfirmation(tool: OpexTool, policy: OpexConfirmationPolicy): boolean {
    return tool.risk === "destructive" || (policy === "writes" && tool.risk === "write")
}
