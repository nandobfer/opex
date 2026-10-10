import { dbConnect } from "@/lib/db"
import { DevTask } from "@/lib/db/models/DevTask"
import { TimeLog } from "@/lib/db/models/TimeLog"
import { TASK_TYPES, TASK_TYPE_LABELS, type TaskType } from "@/features/tasks/constants"
import type { EstimateStat, EstimateStats } from "../preview-prompt"

/**
 * Estatística de horas já trabalhadas pelos agentes, por tipo de tarefa. Alimenta a estimativa da
 * prévia (injetada no prompt — sem ferramenta). SOMENTE servidor.
 */
export async function estimateStats(): Promise<EstimateStats> {
    await dbConnect()
    const logs = await TimeLog.find({ active: false }).select({ taskId: 1, duration: 1, active: 1 }).lean()
    const minutesByTask = new Map<string, number>()
    for (const log of logs) {
        if (log.active === true) continue
        const duration = log.duration ?? 0
        if (duration <= 0) continue
        minutesByTask.set(log.taskId, (minutesByTask.get(log.taskId) ?? 0) + duration)
    }
    if (minutesByTask.size === 0) return { globalAverageHours: 0, totalTasks: 0, byType: [] }

    const tasks = await DevTask.find({ _id: { $in: [...minutesByTask.keys()] } }).select({ taskType: 1 }).lean()
    const byType = new Map<string, { total: number; count: number }>()
    let totalHours = 0
    let totalTasks = 0
    for (const task of tasks) {
        const minutes = minutesByTask.get(String(task._id))
        if (!minutes) continue
        const hours = minutes / 60
        totalHours += hours
        totalTasks += 1
        const key = (task.taskType as string | null) ?? "unknown"
        const bucket = byType.get(key) ?? { total: 0, count: 0 }
        bucket.total += hours
        bucket.count += 1
        byType.set(key, bucket)
    }
    if (totalTasks === 0) return { globalAverageHours: 0, totalTasks: 0, byType: [] }

    const known = new Set<string>(TASK_TYPES)
    const stats: EstimateStat[] = [...byType.entries()]
        .filter(([key]) => known.has(key))
        .map(([key, bucket]) => ({
            taskType: key,
            label: TASK_TYPE_LABELS[key as TaskType],
            averageHours: bucket.total / bucket.count,
            count: bucket.count,
        }))
        .sort((a, b) => b.count - a.count)

    return { globalAverageHours: totalHours / totalTasks, totalTasks, byType: stats }
}
