"use client"

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import { normalizeColor } from "@/lib/colors"
import { centralsByProject } from "../dev-center-product"
import { useCentrals, useCentralsRealtime } from "../hooks/useAgentic"

type ColorOf = (projectId: string) => string | null

const CentralColorsContext = createContext<ColorOf | null>(null)

/** Cor `#RRGGBB` da central do projeto; sem central, sem cor, erro na consulta ou fora do provider = `null` (neutra). */
export function useProjectColor(projectId: string | null | undefined): string | null {
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
    const colorOf = useCallback<ColorOf>((projectId) => normalizeColor(byProject.get(projectId)?.config?.color), [byProject])
    return <CentralColorsContext.Provider value={colorOf}>{children}</CentralColorsContext.Provider>
}
