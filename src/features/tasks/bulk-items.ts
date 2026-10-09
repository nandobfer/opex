import { columnKeyOf, isCustomColumnKey } from "./board"
import { FINAL_TASK_STATUS, requiredUrlFor, type RequiredUrl, type TaskPriority, type TaskStatus } from "./constants"
import { DRAFT_SENDABLE_STATUSES } from "./drafts"
import type { BulkItem } from "./hooks/useBulkTasks"
import type { BulkTaskAction } from "./schemas"
import type { PersonRef, TaskDto } from "./types"

/**
 * Monta os itens das ações em lote (ação para o servidor, mudança otimista e como desfazer).
 * Módulo puro. Tarefas que já estão no valor pedido são puladas.
 */

export interface BulkPlan {
    items: BulkItem[]
    /** Aviso para o toast (ex.: "2 em Produção foram ignoradas"). */
    note?: string
}

/** URL que o lote precisa para mover ao status (uma para todas) e quantas tarefas a exigem. */
export function bulkMoveUrlNeed(tasks: readonly TaskDto[], target: string): { requires: RequiredUrl; count: number } | null {
    if (isCustomColumnKey(target)) return null
    const status = target as TaskStatus
    const needing = tasks.filter((task) => !task.draft && task.status !== status && task.status !== FINAL_TASK_STATUS && requiredUrlFor(task, status))
    if (needing.length === 0) return null
    return { requires: status === "validation" ? "commit" : "pullRequest", count: needing.length }
}

/** Desfazer "voltar para onde estava": a coluna customizada anterior ou a do Go! Sipal. */
function backToPlace(task: TaskDto): { action: BulkTaskAction; patch: Partial<TaskDto> } {
    if (task.localColumn) {
        return {
            action: { type: "local-move", column: task.localColumn, ...(task.localOrder != null ? { order: task.localOrder } : {}) },
            patch: { localColumn: task.localColumn, localOrder: task.localOrder ?? null },
        }
    }
    return { action: { type: "move", targetStatus: task.status }, patch: { localColumn: null, localOrder: null } }
}

/**
 * Mover para uma coluna: customizada (só nO Opex) ou do Go! Sipal (Em Produção não sai; URL
 * única para as que precisam). Desfazer de mudança de status volta o status (a coluna customizada
 * de origem, se havia, não é refeita).
 */
export function planBulkMove(tasks: readonly TaskDto[], target: string, url?: string): BulkPlan {
    if (isCustomColumnKey(target)) {
        return {
            items: tasks
                .filter((task) => task.localColumn !== target)
                .map((task) => ({
                    task,
                    action: { type: "local-move", column: target },
                    patch: { localColumn: target, localOrder: Number.MAX_SAFE_INTEGER },
                    undo: backToPlace(task),
                })),
        }
    }
    const status = target as TaskStatus
    const locked = tasks.filter((task) => !task.draft && task.status === FINAL_TASK_STATUS && status !== FINAL_TASK_STATUS)
    const drafts = tasks.filter((task) => task.draft)
    const sendable = DRAFT_SENDABLE_STATUSES.includes(status)
    // Rascunho em coluna do Go! Sipal = enviar (cria a tarefa; não dá para desfazer).
    const draftItems: BulkItem[] = sendable
        ? drafts.map((task) => ({ task, action: { type: "move", targetStatus: status }, patch: { status, localColumn: null, localOrder: null }, undo: null }))
        : []
    const items = tasks
        .filter((task) => !task.draft && columnKeyOf(task) !== status && !locked.includes(task))
        .map((task): BulkItem => {
            const requires = task.status === status ? null : requiredUrlFor(task, status)
            const commitUrl = requires === "commit" ? url : undefined
            const pullRequestUrl = requires === "pullRequest" ? url : undefined
            const undo =
                task.status === status
                    ? backToPlace(task)
                    : status === FINAL_TASK_STATUS
                      ? null
                      : { action: { type: "move" as const, targetStatus: task.status, order: task.order }, patch: { status: task.status, order: task.order } }
            return {
                task,
                action: { type: "move", targetStatus: status, commitUrl, pullRequestUrl },
                patch: { status, localColumn: null, localOrder: null, ...(commitUrl ? { commitUrl } : {}), ...(pullRequestUrl ? { pullRequestUrl } : {}) },
                undo,
            }
        })
    const notes = [
        locked.length ? `${locked.length} em Produção ignorada(s): não voltam para outras colunas do Go! Sipal.` : null,
        drafts.length && !sendable ? `${drafts.length} rascunho(s) ignorado(s): só podem ser enviados para Backlog, Priorizado, Especificação ou Desenvolvimento.` : null,
    ].filter(Boolean)
    return { items: [...items, ...draftItems], note: notes.length ? notes.join(" ") : undefined }
}

/** Descartar rascunhos (some do quadro quando o servidor confirmar; "Desfazer" restaura). */
export function planBulkDiscard(tasks: readonly TaskDto[]): BulkPlan {
    return {
        items: tasks
            .filter((task) => task.draft)
            .map((task) => ({ task, action: { type: "discard" }, patch: {}, undo: { action: { type: "restore" }, patch: {} } })),
    }
}

export function planBulkAssign(tasks: readonly TaskDto[], person: PersonRef | null): BulkPlan {
    return {
        items: tasks
            .filter((task) => (task.assignee?.id ?? null) !== (person?.id ?? null))
            .map((task) => ({
                task,
                action: { type: "assign", assignee: person?.id ?? null, assigneeName: person?.name ?? null },
                patch: { assignee: person },
                undo: {
                    action: { type: "assign", assignee: task.assignee?.id ?? null, assigneeName: task.assignee?.name ?? null },
                    patch: { assignee: task.assignee },
                },
            })),
    }
}

export function planBulkPriority(tasks: readonly TaskDto[], priority: TaskPriority): BulkPlan {
    return {
        items: tasks
            .filter((task) => task.priority !== priority)
            .map((task) => ({
                task,
                action: { type: "priority", priority },
                patch: { priority },
                undo: { action: { type: "priority", priority: task.priority }, patch: { priority: task.priority } },
            })),
    }
}

export function planBulkArchive(tasks: readonly TaskDto[], archive: boolean): BulkPlan {
    return {
        items: tasks
            .filter((task) => !task.draft && task.archived !== archive)
            .map((task) => ({
                task,
                action: { type: "archive", archive },
                patch: { archived: archive },
                undo: { action: { type: "archive", archive: !archive }, patch: { archived: !archive } },
            })),
    }
}
