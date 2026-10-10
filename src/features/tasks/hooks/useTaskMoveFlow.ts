"use client"

import { useCallback } from "react"
import type { BoardColumnView } from "../board"
import type { TaskDto } from "../types"
import { useMoveTask } from "./useTasks"

/**
 * Fluxo de mudança de coluna usado pelo kanban, pela tabela e pela página da tarefa. Como as
 * colunas são locais e configuráveis, mover é sempre permitido (sem regras de transição).
 */
export function useTaskMoveFlow(columns: readonly BoardColumnView[]) {
    const mutation = useMoveTask()
    const labelOf = useCallback((key: string) => columns.find((column) => column.key === key)?.label ?? key, [columns])

    const move = useCallback(
        (task: TaskDto, target: string, order?: number) => {
            if (task.columnId === target && order === undefined) return
            mutation.mutate({ task, target, targetLabel: labelOf(target), order })
        },
        [mutation, labelOf],
    )

    return { move, movingId: mutation.isPending ? (mutation.variables?.task.id ?? null) : null }
}
