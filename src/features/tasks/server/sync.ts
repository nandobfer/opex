import { dbConnect } from "@/lib/db"
import { GoSipalTaskSnapshot } from "@/lib/db/models/GoSipalTaskSnapshot"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { appChannel, publishToChannels } from "@/lib/pusher/channels"
import { TIME_UPDATED_EVENT } from "@/features/time/schemas"
import { TASKS_UPDATED_EVENT } from "../constants"
import type { TaskDto } from "../types"
import { fetchAllTasks } from "./service"

/**
 * Rotina "Sincronizar tarefas do Go! Sipal" (Integrações › Crons, intervalo configurável na tela).
 * O Go! Sipal não avisa mudanças: a rotina lê o quadro, compara com a última leitura e publica
 * `tasks-updated { ids }` no canal `private-app` — a tela recarrega só quando algo mudou.
 */

export const TASK_SYNC_MAX_IDS = 200

export function taskSignature(task: TaskDto): string {
    return [task.status, task.order, task.updatedAt ?? "", task.assignee?.id ?? "", task.archived ? 1 : 0, task.priority, task.taskType ?? "", task.workPackage?.id ?? ""].join("|")
}

/** Ids novos, alterados ou que sumiram do quadro. */
export function diffSignatures(previous: Record<string, string>, next: Record<string, string>): string[] {
    const changed = Object.keys(next).filter((id) => previous[id] !== next[id])
    const removed = Object.keys(previous).filter((id) => !(id in next))
    return [...changed, ...removed]
}

export async function syncGoSipalTasks(): Promise<string> {
    const config = await getIntegrationConfig("go_sipal")
    if (!config.token) return "Pulada: Go! Sipal sem sessão"

    const tasks = await fetchAllTasks({ includeArchived: true })
    const signatures = Object.fromEntries(tasks.map((task) => [task.id, taskSignature(task)]))

    await dbConnect()
    const timers = await syncActiveTimers()
    const snapshot = await GoSipalTaskSnapshot.findOne({ key: "board" }).lean()
    await GoSipalTaskSnapshot.updateOne({ key: "board" }, { $set: { signatures, syncedAt: new Date() } }, { upsert: true })

    if (!snapshot) return `Referência inicial gravada (${tasks.length} tarefa(s))${timers}`
    const changed = diffSignatures(snapshot.signatures ?? {}, signatures)
    const issues = changed.length ? await closeIssuesOfMovedTasks(tasks, changed) : ""
    if (changed.length === 0) return `Sem mudanças (${tasks.length} tarefa(s))${timers}`

    // Payload mínimo: até 200 ids (o Pusher limita o tamanho); a tela recarrega o quadro todo.
    await publishToChannels([appChannel()], TASKS_UPDATED_EVENT, { ids: changed.slice(0, TASK_SYNC_MAX_IDS) })
    integrationDebug("go_sipal").info(`Sincronização: ${changed.length} tarefa(s) mudaram no Go! Sipal`)
    return `${changed.length} tarefa(s) mudaram; tela avisada${timers}${issues}`
}

/** Tarefas movidas para Validação direto no Go! Sipal fecham a issue do GitHub vinculada. */
async function closeIssuesOfMovedTasks(tasks: TaskDto[], changed: string[]): Promise<string> {
    try {
        const { closeIssuesOfValidatedTasks } = await import("@/features/github/server/issue-links")
        const ids = new Set(changed)
        const closed = await closeIssuesOfValidatedTasks(tasks.filter((task) => ids.has(task.id)))
        return closed ? `; ${closed} issue(s) do GitHub fechada(s)` : ""
    } catch {
        return ""
    }
}

/**
 * Timers ativos (iniciados/parados também direto no go.sipal): compara com a última leitura
 * (documento `timers`: id do apontamento → tarefa) e publica `time-updated` se mudou. Falha aqui não
 * derruba a sincronização do quadro.
 */
async function syncActiveTimers(): Promise<string> {
    try {
        const { listActiveTimers } = await import("@/features/time/server/service")
        const active = await listActiveTimers()
        const signatures = Object.fromEntries(active.map((log) => [log.id, log.taskId ?? ""]))
        const snapshot = await GoSipalTaskSnapshot.findOne({ key: "timers" }).lean()
        await GoSipalTaskSnapshot.updateOne({ key: "timers" }, { $set: { signatures, syncedAt: new Date() } }, { upsert: true })
        const changed = snapshot ? diffSignatures(snapshot.signatures ?? {}, signatures) : []
        if (changed.length === 0) return ""
        const before = snapshot?.signatures ?? {}
        const taskIds = [...new Set(changed.map((id) => signatures[id] ?? before[id] ?? "").filter(Boolean))]
        await publishToChannels([appChannel()], TIME_UPDATED_EVENT, { taskIds })
        return `; timers mudaram (${active.length} ativo(s))`
    } catch (error) {
        integrationDebug("go_sipal").warn(`Sincronização de timers falhou: ${error instanceof Error ? error.message : String(error)}`)
        return "; timers indisponíveis"
    }
}
