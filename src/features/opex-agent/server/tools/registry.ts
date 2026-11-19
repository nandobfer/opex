import type { OpexToolGroup } from "../../constants"
import { isAlwaysOnGroup, toolConfirms, type OpexToolMetaDto } from "../../tool-tree"
import type { OpexTool } from "./define"
import { pluginToolList } from "@/features/plugins/server/kernel/registries"
import { appearanceTools } from "./appearance"
import { centralTools } from "./centrals"
import { clientTools } from "./clients"
import { contextTools } from "./context"
import { docTools } from "./docs"
import { engramindTools } from "./engramind"
import { environmentTools } from "./environments"
import { fileTools } from "./files"
import { githubTools } from "./github"
import { hostTools } from "./host"
import { httpTools } from "./http"
import { financeTools } from "./finance"
import { integrationTools } from "./integrations"
import { issueTools } from "./issues"
import { jobTools } from "./jobs"
import { mcpTools } from "./mcp"
import { memoryTools } from "./memories"
import { opencodeResourceTools, opencodeServiceTools } from "./opencode"
import { aiSettingsTools, dashboardTools, prReviewTools } from "./misc"
import { pluginTools } from "./plugins"
import { previewTools } from "./previews"
import { routineAgentTools } from "./routine-agents"
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
    ...routineAgentTools,
    ...httpTools,
    ...aiSettingsTools,
    ...prReviewTools,
    ...dashboardTools,
    ...serviceTools,
    ...financeTools,
    ...clientTools,
    ...hostTools,
    ...environmentTools,
    ...appearanceTools,
    ...engramindTools,
    ...opencodeServiceTools,
    ...opencodeResourceTools,
    ...mcpTools,
    ...pluginTools,
] as readonly OpexTool[]

/**
 * Catálogo completo: as ferramentas estáticas mais as registradas pelos plugins do dono em tempo de
 * execução (OPE-172, grupo `plugin-tools`). Com a prévia de um plugin ligada no turno, valem as
 * ferramentas da versão `preview` dele.
 */
export function allOpexTools(previewPlugins: ReadonlySet<string> = new Set()): OpexTool[] {
    return [...OPEX_TOOLS, ...pluginToolList(previewPlugins)]
}

export function findOpexTool(name: string, previewPlugins?: ReadonlySet<string>): OpexTool | undefined {
    return allOpexTools(previewPlugins).find((tool) => tool.name === name)
}

/** Metadados exibidos na configuração (sem a entrada nem a execução). */
export function opexToolMetas(): OpexToolMetaDto[] {
    return allOpexTools().map((tool) => ({
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
export function enabledOpexTools(disabledTools: readonly string[], previewPlugins?: ReadonlySet<string>): OpexTool[] {
    const disabled = new Set(disabledTools)
    return allOpexTools(previewPlugins).filter((tool) => isAlwaysOnGroup(tool.group) || !disabled.has(tool.name))
}

/** Pede Confirmar/Cancelar? Ajuste da ferramenta; sem ajuste, as destrutivas e as `confirmByDefault`. */
export function needsConfirmation(tool: OpexTool, overrides: Readonly<Record<string, boolean>> = {}): boolean {
    return toolConfirms(tool, overrides)
}
