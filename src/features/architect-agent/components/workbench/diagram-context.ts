"use client"

import { createContext, useContext } from "react"

/**
 * Estado compartilhado pelos nós e arestas do canvas sem recriar a lista do React Flow a cada hover:
 * o nó em foco (hover) e o que se liga a ele, o nó selecionado e as ações dos grupos.
 */
export interface DiagramHighlight {
    focusedId: string | null
    relatedNodes: ReadonlySet<string>
    relatedEdges: ReadonlySet<string>
    selectedId: string | null
    reducedMotion: boolean
    /** Diagrama sendo desenhado ao vivo: entrada sem atraso por camada e pulso nas arestas que nascem. */
    live: boolean
    showFiles: boolean
    onToggleGroup: (groupId: string) => void
}

export const DiagramHighlightContext = createContext<DiagramHighlight>({
    focusedId: null,
    relatedNodes: new Set(),
    relatedEdges: new Set(),
    selectedId: null,
    reducedMotion: false,
    live: false,
    showFiles: true,
    onToggleGroup: () => undefined,
})

export const useDiagramHighlight = () => useContext(DiagramHighlightContext)

/** Nó esmaecido: há um foco e o nó não é ele nem um vizinho dele. */
export function isDimmed(highlight: DiagramHighlight, id: string): boolean {
    return Boolean(highlight.focusedId) && highlight.focusedId !== id && !highlight.relatedNodes.has(id)
}

/** Atraso da entrada animada por camada/anel (movimento reduzido: sem atraso). */
export const enterDelay = (rank: number, reducedMotion: boolean) => (reducedMotion ? 0 : Math.min(rank, 12) * 0.06)
