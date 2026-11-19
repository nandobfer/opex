import { DomainError } from "@/lib/api/route"
import type { IDevTask } from "@/lib/db/models/DevTask"
import { pluginTargetIssue, type TaskPluginTarget } from "./schemas"

/**
 * Alvo do plugin gravado na tarefa (OPE-172). Só o tipo Plugin tem alvo; tarefa vinculada a um cliente
 * (vinda do portal) é do escopo desse cliente: sem alvo, ele é deduzido; um alvo que diverge (escopo
 * do dono ou outro cliente) é recusado com erro explícito, nunca trocado em silêncio. Sem alvo válido
 * no tipo Plugin, recusa em pt-BR.
 */
export function resolvePluginTarget(taskType: string | null, target: TaskPluginTarget | null, taskClientId: string | null): IDevTask["pluginTarget"] {
    if (taskType !== "plugin") return null
    if (taskClientId && target && (target.scope !== "client" || (target.clientId && target.clientId !== taskClientId))) {
        throw new DomainError(400, "Esta tarefa é de um cliente: o plugin dela é do escopo Cliente, do mesmo cliente da tarefa. Escolha o escopo Cliente.", "TASK_PLUGIN_SCOPE_CONFLICT")
    }
    const effective: TaskPluginTarget | null = taskClientId ? { scope: "client", clientId: taskClientId, pluginId: target?.pluginId ?? null } : target
    const issue = pluginTargetIssue(taskType, effective)
    if (issue) throw new DomainError(400, issue.message, "TASK_PLUGIN_TARGET")
    return { scope: effective!.scope, clientId: effective!.scope === "client" ? (effective!.clientId ?? null) : null, pluginId: effective!.pluginId ?? null }
}
