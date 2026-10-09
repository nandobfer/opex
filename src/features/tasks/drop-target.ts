import { arrayMove } from "@dnd-kit/sortable"
import { columnKeyOf, isCustomColumnKey } from "./board"
import type { TaskSortKey } from "./constants"
import { computeDropOrderInList } from "./ordering"
import type { TaskDto } from "./types"

/**
 * Lógica pura do arraste de cards no kanban (vários contêineres). `ColumnItems` = ids por coluna,
 * na ordem exibida.
 */
export type ColumnItems = Readonly<Record<string, readonly string[]>>

/** Ordem usada na coluna: a local nas customizadas, a do Go! Sipal nas demais. */
export function boardOrderOf(task: Pick<TaskDto, "order" | "localColumn" | "localOrder">, columnKey: string): number {
    if (!isCustomColumnKey(columnKey)) return task.order
    return task.localColumn === columnKey ? (task.localOrder ?? 0) : 0
}

/**
 * Durante o arraste: o card sai de `from` e entra em `to` na posição do card sob o cursor (ou
 * depois dele, se o cursor passou da metade; no fim, se está sobre a área vazia da coluna). Assim
 * os cards abaixo descem e abrem o espaço antes de soltar.
 */
export function moveBetweenColumns(items: ColumnItems, id: string, from: string, to: string, overId: string, below: boolean): ColumnItems {
    const source = (items[from] ?? []).filter((item) => item !== id)
    const target = (items[to] ?? []).filter((item) => item !== id)
    const overIndex = target.indexOf(overId)
    const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length
    target.splice(index, 0, id)
    return { ...items, [from]: source, [to]: target }
}

/**
 * Ao soltar: posição final na coluna `target` e o `order` a enviar (só na ordenação Manual; nas
 * demais o card se acomoda pela ordenação). `null` = nada mudou (mesma coluna e mesma posição, ou
 * reordenar na mesma coluna fora da ordenação Manual).
 */
export function finalDropPosition(
    current: ColumnItems,
    original: ColumnItems,
    task: TaskDto,
    target: string,
    overId: string,
    sort: TaskSortKey,
    byId: ReadonlyMap<string, TaskDto>,
): { items: ColumnItems; order?: number } | null {
    const origin = columnKeyOf(task)
    let list = [...(current[target] ?? [])]
    if (!list.includes(task.id)) {
        const overIndex = list.indexOf(overId)
        list.splice(overIndex === -1 ? list.length : overIndex, 0, task.id)
    } else {
        const from = list.indexOf(task.id)
        const to = list.indexOf(overId)
        if (to !== -1 && from !== to) list = arrayMove(list, from, to)
    }

    if (origin === target) {
        if (sort !== "manual") return null
        const before = original[target] ?? []
        if (before.length === list.length && before.every((id, index) => list[index] === id)) return null
    }

    const items: ColumnItems = {
        ...current,
        ...(origin !== target ? { [origin]: (current[origin] ?? []).filter((id) => id !== task.id) } : {}),
        [target]: list,
    }
    if (sort !== "manual") return { items }
    const index = list.indexOf(task.id)
    const orders = list
        .filter((id) => id !== task.id)
        .map((id) => {
            const other = byId.get(id)
            return other ? boardOrderOf(other, target) : 0
        })
    return { items, order: computeDropOrderInList(orders, index) }
}
