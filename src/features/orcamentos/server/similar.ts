import { dbConnect } from "@/lib/db"
import { DevTask } from "@/lib/db/models/DevTask"
import { TimeLog } from "@/lib/db/models/TimeLog"
import type { TaskType } from "@/features/tasks/constants"

/**
 * Tarefas semelhantes para embasar a estimativa (SOMENTE servidor). Busca por **tags** (primário) e,
 * para completar, por **tipo** e **projeto** (fallback). A âncora é o **tempo de execução observado**:
 * só entram tarefas com horas reais apontadas (`TimeLog`); tarefas sem apontamento são descartadas —
 * não se usa a estimativa anterior da IA como referência (o erro se realimentaria).
 */

export interface SimilarTask {
    code: string
    title: string
    taskType: TaskType | null
    tags: string[]
    /** Horas reais apontadas (tempo observado). Sempre um número positivo. */
    hours: number
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
}

const SELECT = { code: 1, title: 1, taskType: 1, tags: 1 } as const

export async function findSimilarTasks(input: SimilarTasksInput): Promise<SimilarTask[]> {
    await dbConnect()
    const limit = Math.max(1, input.limit)
    const pool = Math.max(limit * 4, 20)
    const base = { archived: { $ne: true } }

    // Candidatos em ordem de prioridade (tags → tipo → projeto), sem repetição.
    const ordered: Array<{ doc: Candidate; match: SimilarTask["match"] }> = []
    const seen = new Set<string>()
    const push = (docs: Candidate[], match: SimilarTask["match"]) => {
        for (const doc of docs) {
            const id = String(doc._id)
            if (seen.has(id)) continue
            seen.add(id)
            ordered.push({ doc, match })
        }
    }

    if (input.tags.length) {
        push(await DevTask.find({ ...base, tags: { $in: input.tags } }).sort({ updatedAt: -1 }).limit(pool).select(SELECT).lean(), "tag")
    }
    if (input.taskType) {
        push(await DevTask.find({ ...base, taskType: input.taskType }).sort({ updatedAt: -1 }).limit(pool).select(SELECT).lean(), "type")
    }
    if (input.projectId) {
        push(await DevTask.find({ ...base, projectId: input.projectId }).sort({ updatedAt: -1 }).limit(pool).select(SELECT).lean(), "project")
    }
    if (ordered.length === 0) return []

    // Horas reais apontadas (minutos) — tarefas sem apontamento ficam de fora da âncora.
    const ids = ordered.map(({ doc }) => String(doc._id))
    const logs = await TimeLog.aggregate<{ _id: string; minutes: number }>([
        { $match: { taskId: { $in: ids }, active: { $ne: true } } },
        { $group: { _id: "$taskId", minutes: { $sum: "$duration" } } },
    ])
    const minutesByTask = new Map(logs.map((row) => [row._id, row.minutes]))

    const result: SimilarTask[] = []
    for (const { doc, match } of ordered) {
        const minutes = minutesByTask.get(String(doc._id)) ?? 0
        if (minutes <= 0) continue
        result.push({
            code: doc.code,
            title: doc.title,
            taskType: (doc.taskType as TaskType | null) ?? null,
            tags: doc.tags ?? [],
            hours: Math.round((minutes / 60) * 10) / 10,
            match,
        })
        if (result.length >= limit) break
    }
    return result
}
