"use client"

import { useCallback } from "react"
import { planBulkArchive, planBulkMove, planBulkPriority, type BulkPlan } from "../bulk-items"
import type { BoardColumnView } from "../board"
import { TASK_PRIORITY_LABELS, type TaskPriority } from "../constants"
import type { TaskDto } from "../types"
import { useBulkTasks } from "./useBulkTasks"

/**
 * Ações em lote das tarefas selecionadas (barra flutuante e arraste múltiplo no kanban). Ao
 * terminar, as que deram certo saem da seleção; as que falharam continuam selecionadas.
 */
export function useTaskBulkActions(onSucceeded: (ids: string[]) => void, columns: readonly BoardColumnView[]) {
    const bulk = useBulkTasks()
    const labelOf = useCallback((key: string) => columns.find((column) => column.key === key)?.label ?? key, [columns])

    const execute = useCallback(
        (label: string, plan: BulkPlan) =>
            bulk.run(label, plan.items, {
                undoable: true,
                note: plan.note,
                onDone: (results) => onSucceeded(results.filter((result) => result.ok).map((result) => result.id)),
            }),
        [bulk, onSucceeded],
    )

    const move = useCallback((tasks: TaskDto[], target: string) => void execute(`Mover para ${labelOf(target)}`, planBulkMove(tasks, target)), [execute, labelOf])
    const prioritize = useCallback(
        (tasks: TaskDto[], priority: TaskPriority) => void execute(`Prioridade ${TASK_PRIORITY_LABELS[priority].toLowerCase()}`, planBulkPriority(tasks, priority)),
        [execute],
    )
    const archive = useCallback((tasks: TaskDto[], value: boolean) => void execute(value ? "Arquivar" : "Desarquivar", planBulkArchive(tasks, value)), [execute])

    return { move, prioritize, archive, progress: bulk.progress, running: bulk.running }
}
