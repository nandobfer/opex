import { dbConnect } from "@/lib/db"
import { DevTask } from "@/lib/db/models/DevTask"
import { TimeLog } from "@/lib/db/models/TimeLog"
import type { TaskType } from "@/features/tasks/constants"

/**
 * Tarefas semelhantes para embasar a estimativa (SOMENTE servidor). Busca por **tags** (primário) e,
 * para completar, por **tipo** e **projeto** (fallback), sempre recentes e não arquivadas. As horas
 * vêm dos apontamentos reais (`TimeLog`) quando houver; senão, da estimativa anterior da IA.
 */

export interface SimilarTask {
    code: string
    title: string
    taskType: TaskType | null
    tags: string[]
    /** Horas: apontadas quando houver; senão a estimativa da IA. `null` sem histórico. */
    hours: number | null
    /** Como foi encontrada (para o prompt e diagnóstico). */
    match: "tag" | "type" | "project"
}

export interface SimilarTasksInput {
    tags: string[]
    taskType: TaskType | null
    projectId: string
    limit: number
}

interface Candidate {
    _id: unknown
    code: string
    title: string
    taskType: string | null
    tags?: string[]
    estimate?: { hours?: number } | null
}

const SELECT = { code: 1, title: 1, taskType: 1, tags: 1, estimate: 1 } as const

export async function findSimilarTasks(input: SimilarTasksInput): Promise<SimilarTask[]> {
    await dbConnect()
    const limit = Math.max(1, input.limit)
    const chosen = new Map<string, SimilarTask>()
    const estimateHours = new Map<string, number | null>()
    const base = { archived: { $ne: true } }

    const take = (docs: Candidate[], match: SimilarTask["match"]) => {
        for (const doc of docs) {
            const id = String(doc._id)
            if (chosen.has(id) || chosen.size >= limit) continue
            const hours = typeof doc.estimate?.hours === "number" ? doc.estimate.hours : null
            estimateHours.set(id, hours)
            chosen.set(id, { code: doc.code, title: doc.title, taskType: (doc.taskType as TaskType | null) ?? null, tags: doc.tags ?? [], hours, match })
        }
    }

    if (input.tags.length) {
        take(await DevTask.find({ ...base, tags: { $in: input.tags } }).sort({ updatedAt: -1 }).limit(limit).select(SELECT).lean(), "tag")
    }
    if (chosen.size < limit && input.taskType) {
        const exclude = [...chosen.keys()]
        take(await DevTask.find({ ...base, taskType: input.taskType, ...(exclude.length ? { _id: { $nin: exclude } } : {}) }).sort({ updatedAt: -1 }).limit(limit).select(SELECT).lean(), "type")
    }
    if (chosen.size < limit && input.projectId) {
        const exclude = [...chosen.keys()]
        take(await DevTask.find({ ...base, projectId: input.projectId, ...(exclude.length ? { _id: { $nin: exclude } } : {}) }).sort({ updatedAt: -1 }).limit(limit).select(SELECT).lean(), "project")
    }

    if (chosen.size === 0) return []

    // Horas reais apontadas (minutos) prevalecem sobre a estimativa anterior.
    const ids = [...chosen.keys()]
    const logs = await TimeLog.aggregate<{ _id: string; minutes: number }>([
        { $match: { taskId: { $in: ids }, active: { $ne: true } } },
        { $group: { _id: "$taskId", minutes: { $sum: "$duration" } } },
    ])
    const minutesByTask = new Map(logs.map((row) => [row._id, row.minutes]))
    for (const [id, task] of chosen) {
        const minutes = minutesByTask.get(id) ?? 0
        task.hours = minutes > 0 ? Math.round((minutes / 60) * 10) / 10 : (estimateHours.get(id) ?? null)
    }
    return [...chosen.values()]
}
