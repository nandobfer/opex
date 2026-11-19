import { DomainError } from "@/lib/api/route"
import type { IDevTask } from "@/lib/db/models/DevTask"
import { pluginTargetIssue, type TaskPluginTarget } from "./schemas"

/**
 * Alvo do plugin gravado na tarefa (OPE-172). Só o tipo Plugin tem alvo; tarefa vinda do portal é
 * sempre do escopo do próprio cliente. Sem alvo válido no tipo Plugin, recusa em pt-BR.
 */
export function resolvePluginTarget(taskType: string | null, target: TaskPluginTarget | null, taskClientId: string | null): IDevTask["pluginTarget"] {
    if (taskType !== "plugin") return null
    const effective: TaskPluginTarget | null = taskClientId ? { scope: "client", clientId: taskClientId, pluginId: target?.pluginId ?? null } : target
    const issue = pluginTargetIssue(taskType, effective)
    if (issue) throw new DomainError(400, issue.message, "TASK_PLUGIN_TARGET")
    return { scope: effective!.scope, clientId: effective!.scope === "client" ? (effective!.clientId ?? null) : null, pluginId: effective!.pluginId ?? null }
}
