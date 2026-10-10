"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useTaskTagsSettings } from "@/features/ai/hooks/useAi"
import { DEFAULT_TASK_TAXONOMY, type TaskTagDef } from "../tags"

/**
 * Taxonomia de tags compartilhada pelas telas de Tarefas. Fora do provider cai na taxonomia
 * padrão — os componentes puros (cards/tabela) seguem funcionando sem depender de consulta.
 */
const TaskTaxonomyContext = createContext<TaskTagDef[]>(DEFAULT_TASK_TAXONOMY)

export function useTaskTaxonomy(): TaskTagDef[] {
    return useContext(TaskTaxonomyContext)
}

/** Publica a taxonomia configurada em "Tags de tarefas" (cacheada pelo TanStack Query). */
export function TaskTaxonomyProvider({ children }: { children: ReactNode }) {
    const query = useTaskTagsSettings()
    const taxonomy = query.data?.settings.taxonomy ?? DEFAULT_TASK_TAXONOMY
    return <TaskTaxonomyContext.Provider value={taxonomy}>{children}</TaskTaxonomyContext.Provider>
}
