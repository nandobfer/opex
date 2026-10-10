"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useWorkbenchesInProgress, useWorkbenchProgressRealtime } from "../hooks/useAgentic"
import type { InProgressWorkbenchDto } from "../types"

interface WorkbenchProgressContextValue {
    items: InProgressWorkbenchDto[]
    /** Mesa em andamento da tarefa (executando ou aguardando ação humana), se houver. */
    progressOf: (taskId: string) => InProgressWorkbenchDto | undefined
}

const WorkbenchProgressContext = createContext<WorkbenchProgressContextValue | null>(null)

/** Fora do provider (testes, telas sem o destaque) não há mesa em andamento. */
export function useWorkbenchProgress(): WorkbenchProgressContextValue | null {
    return useContext(WorkbenchProgressContext)
}

/**
 * Mesas em andamento compartilhadas pela tela de Tarefas: alimenta o indicador "Trabalhos em
 * andamento" e o destaque (warning) das tarefas cujo agente aguarda ação humana. **Somente
 * leitura** — as mesas são abertas/fechadas na Central de desenvolvimento.
 */
export function WorkbenchProgressProvider({ enabled = true, children }: { enabled?: boolean; children: ReactNode }) {
    const query = useWorkbenchesInProgress(enabled)
    useWorkbenchProgressRealtime()
    const items = useMemo(() => query.data ?? [], [query.data])
    const byTask = useMemo(() => new Map(items.map((item) => [item.taskId, item])), [items])
    const value = useMemo<WorkbenchProgressContextValue>(() => ({ items, progressOf: (taskId) => byTask.get(taskId) }), [items, byTask])

    return <WorkbenchProgressContext.Provider value={value}>{children}</WorkbenchProgressContext.Provider>
}
