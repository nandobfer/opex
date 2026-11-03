"use client"

import { useEffect, useMemo, useState } from "react"
import { z } from "zod"
import { usePersistentState } from "@/hooks/usePersistentState"
import { ARCHITECT_LIVE_LAYOUT_DEBOUNCE_MS, type ArchitectView } from "../constants"
import { filterGraph, toViewGraph, type GraphFilter, type ViewGraph } from "../filters"
import type { ArchitectGraph } from "../graph"
import { layoutArchitecture, layoutMindMap, type LayoutResult } from "../layout"

/**
 * Ao vivo, o grafo que entra no layout espera o lote de operações assentar (o layout não treme a cada
 * linha); fora do ao vivo, passa direto.
 */
export function useSettledGraph(graph: ArchitectGraph, live: boolean): ArchitectGraph {
    const [settled, setSettled] = useState(graph)
    useEffect(() => {
        if (!live) return
        const timer = setTimeout(() => setSettled(graph), ARCHITECT_LIVE_LAYOUT_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [graph, live])
    return live ? settled : graph
}

/** Grafo filtrado, a visão (grupos recolhidos) e o layout automático da visão escolhida. */
export function useDiagramLayout(graph: ArchitectGraph, view: ArchitectView, filter: GraphFilter, collapsed: ReadonlySet<string>): { filtered: ArchitectGraph; viewGraph: ViewGraph; layout: LayoutResult } {
    const kindsKey = filter.kinds.join(",")
    const collapsedKey = [...collapsed].sort().join(",")
    return useMemo(() => {
        const filtered = filterGraph(graph, filter)
        const viewGraph = toViewGraph(filtered, collapsed)
        return { filtered, viewGraph, layout: view === "architecture" ? layoutArchitecture(viewGraph) : layoutMindMap(viewGraph) }
        // `filter`/`collapsed` entram pelas chaves (objetos novos a cada render).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [graph, view, kindsKey, filter.onlyChanges, collapsedKey])
}

const positionsSchema = z.record(z.string(), z.object({ x: z.number(), y: z.number() }))
export type DiagramPositions = z.infer<typeof positionsSchema>
const EMPTY: DiagramPositions = {}

/** Chave das posições arrastadas: por mesa, versão do diagrama e visão (só no navegador). */
export const positionsKey = (workbenchId: string, diagramId: string, view: ArchitectView) => `opex:architect-positions:v1:${workbenchId}:${diagramId}:${view}`

/** Posições arrastadas pelo usuário (nunca vão para o banco). */
export function useDiagramPositions(workbenchId: string, diagramId: string, view: ArchitectView) {
    const { value, setValue, reset } = usePersistentState(positionsKey(workbenchId, diagramId, view), positionsSchema, EMPTY)
    return {
        positions: value,
        save: (id: string, position: { x: number; y: number }) => setValue((current) => ({ ...current, [id]: { x: Math.round(position.x), y: Math.round(position.y) } })),
        reset,
    }
}
