"use client"

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import type { ColumnColor } from "@/features/tasks/board"
import { centralsByProject } from "../dev-center-product"
import { useCentrals, useCentralsRealtime } from "../hooks/useAgentic"

type ColorOf = (projectId: string) => ColumnColor | null

const CentralColorsContext = createContext<ColorOf | null>(null)

/** Cor da central do projeto; sem central, sem cor, erro na consulta ou fora do provider = `null` (neutra). */
export function useProjectColor(projectId: string | null | undefined): ColumnColor | null {
    const colorOf = useContext(CentralColorsContext)
    return projectId && colorOf ? colorOf(projectId) : null
}

/**
 * Cores das centrais (`config.color`) por projeto, para a tela de Tarefas pintar o repositório.
 * **Somente leitura**: a cor é escolhida nas configurações da central; muda em tempo real.
 */
export function CentralColorsProvider({ children }: { children: ReactNode }) {
    const query = useCentrals()
    useCentralsRealtime()
    const byProject = useMemo(() => centralsByProject(query.data ?? []), [query.data])
    const colorOf = useCallback<ColorOf>((projectId) => byProject.get(projectId)?.config?.color ?? null, [byProject])
    return <CentralColorsContext.Provider value={colorOf}>{children}</CentralColorsContext.Provider>
}
