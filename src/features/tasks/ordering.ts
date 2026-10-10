import { TASK_PRIORITY_RANK, type TaskSortKey } from "./constants"
import type { TaskDto } from "./types"

/**
 * Ordenação dos cards e cálculo do `order` ao soltar. Módulo puro.
 */

const createdMs = (task: Pick<TaskDto, "createdAt">) => {
    const ms = task.createdAt ? new Date(task.createdAt).getTime() : 0
    return Number.isNaN(ms) ? 0 : ms
}

/** Não muta a lista recebida. `orderOf` troca o campo de ordem (ex.: ordem local da coluna customizada). */
export function sortTasks<T extends Pick<TaskDto, "priority" | "order" | "createdAt">>(tasks: readonly T[], key: TaskSortKey, orderOf: (task: T) => number = (task) => task.order): T[] {
    const copy = [...tasks]
    switch (key) {
        case "manual":
            return copy.sort((a, b) => orderOf(a) - orderOf(b))
        case "newest":
            return copy.sort((a, b) => createdMs(b) - createdMs(a) || orderOf(a) - orderOf(b))
        case "oldest":
            return copy.sort((a, b) => createdMs(a) - createdMs(b) || orderOf(a) - orderOf(b))
        case "priority":
        default:
            return copy.sort((a, b) => TASK_PRIORITY_RANK[a.priority] - TASK_PRIORITY_RANK[b.priority] || orderOf(a) - orderOf(b))
    }
}

/** Ponto médio entre os vizinhos (só a tarefa arrastada muda). */
export function computeDropOrder(prev?: number, next?: number): number {
    const hasPrev = typeof prev === "number" && Number.isFinite(prev)
    const hasNext = typeof next === "number" && Number.isFinite(next)
    if (hasPrev && hasNext) return (prev + next) / 2
    if (hasPrev) return prev + 1
    if (hasNext) return next - 1
    return 0
}

/**
 * `order` para a posição `at` de uma coluna já ordenada por `order`. Com `order` empatado (vem
 * numerado por produto), o vizinho de baixo é o primeiro MAIOR que o de cima — senão o ponto
 * médio devolveria o próprio valor e o card não sairia do lugar.
 */
export function computeDropOrderInList(orders: readonly number[], at: number): number {
    const index = Math.max(0, Math.min(at, orders.length))
    const prev = index > 0 ? orders[index - 1] : undefined
    const next = orders.slice(index).find((order) => prev === undefined || order > prev)
    return computeDropOrder(prev, next)
}
