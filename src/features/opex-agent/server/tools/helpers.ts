import { z } from "zod"
import { listTasks } from "@/features/tasks/server/service"
import type { TaskDto } from "@/features/tasks/types"
import { OpexToolError } from "./define"

const OBJECT_ID = /^[a-f0-9]{24}$/i

export const objectIdSchema = z.string().trim().regex(OBJECT_ID, "Id inválido (24 caracteres hexadecimais)")

export const taskRefSchema = z.string().trim().min(1).max(60).describe("Código da tarefa (ex.: OPX-123) ou id")

export const isObjectId = (value: string) => OBJECT_ID.test(value)

/** Aceita id (ObjectId) ou código (OPX-123, sem diferenciar maiúsculas). */
export async function resolveTask(ref: string): Promise<{ id: string; task: TaskDto | null }> {
    const value = ref.trim()
    if (OBJECT_ID.test(value)) return { id: value, task: null }
    const { tasks } = await listTasks(true)
    const found = tasks.find((task) => task.code.toLowerCase() === value.toLowerCase())
    if (!found) throw new OpexToolError(`Tarefa "${value}" não encontrada. Use list_tasks para achar o código certo.`)
    return { id: found.id, task: found }
}

/** Tarefa da lista em formato enxuto para o modelo. */
export function slimTask(task: TaskDto) {
    return {
        id: task.id,
        code: task.code,
        title: task.title,
        column: task.columnId,
        type: task.taskType,
        priority: task.priority,
        project: task.project?.name ?? null,
        projectId: task.project?.id ?? null,
        repo: task.project?.repo ?? null,
        summary: task.summary ?? null,
        tags: task.tags ?? [],
        estimateHours: task.estimate?.hours ?? null,
        archived: task.archived,
        issue: task.issue?.url ?? null,
        agenticFlow: task.agenticFlow,
        updatedAt: task.updatedAt,
    }
}

/** Texto longo cortado para não estourar o contexto do modelo. */
export function clipText(value: string | null | undefined, max: number): string | null {
    if (value == null) return null
    return value.length > max ? `${value.slice(0, max)}…(+${(value.length - max).toLocaleString("pt-BR")} caracteres)` : value
}

/** Coleta um gerador NDJSON de feature (`delta`/`done`/`error`), devolvendo o `done` ou lançando o erro. */
export async function collectFeatureStream<E extends { type: string }>(events: AsyncIterable<E>): Promise<{ done: Extract<E, { type: "done" }> | null; text: string }> {
    let text = ""
    let done: Extract<E, { type: "done" }> | null = null
    for await (const event of events) {
        if (event.type === "delta") text += String((event as unknown as { text?: string }).text ?? "")
        if (event.type === "error") throw new OpexToolError(String((event as unknown as { message?: string }).message ?? "Falha na geração"))
        if (event.type === "done") done = event as Extract<E, { type: "done" }>
    }
    return { done, text }
}
