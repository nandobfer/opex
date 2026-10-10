import type { BulkItem } from "./hooks/useBulkTasks"
import { TASK_PRIORITY_LABELS, type TaskPriority } from "./constants"
import type { TaskDto } from "./types"

/**
 * Monta os itens das ações em lote (ação para o servidor, mudança otimista e como desfazer).
 * Módulo puro. Tarefas que já estão no valor pedido são puladas.
 */

export interface BulkPlan {
    items: BulkItem[]
    /** Aviso para o toast. */
    note?: string
}

export function planBulkMove(tasks: readonly TaskDto[], target: string): BulkPlan {
    return {
        items: tasks
            .filter((task) => task.columnId !== target)
            .map((task) => ({
                task,
                action: { type: "move" as const, column: target },
                patch: { columnId: target, order: Number.MAX_SAFE_INTEGER },
                undo: { action: { type: "move" as const, column: task.columnId }, patch: { columnId: task.columnId, order: task.order } },
            })),
    }
}

export function planBulkPriority(tasks: readonly TaskDto[], priority: TaskPriority): BulkPlan {
    return {
        items: tasks
            .filter((task) => task.priority !== priority)
            .map((task) => ({
                task,
                action: { type: "priority" as const, priority },
                patch: { priority },
                undo: { action: { type: "priority" as const, priority: task.priority }, patch: { priority: task.priority } },
            })),
    }
}

export function planBulkArchive(tasks: readonly TaskDto[], archive: boolean): BulkPlan {
    return {
        items: tasks
            .filter((task) => task.archived !== archive)
            .map((task) => ({
                task,
                action: { type: "archive" as const, archive },
                patch: { archived: archive },
                undo: { action: { type: "archive" as const, archive: !archive }, patch: { archived: !archive } },
            })),
    }
}

export const priorityLabel = (priority: TaskPriority) => TASK_PRIORITY_LABELS[priority]
