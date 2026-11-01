"use client"

import { useMemo, useState } from "react"
import { useReactFlow } from "@xyflow/react"
import { useReducedMotion } from "framer-motion"
import { Maximize, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ArchitectView } from "../../constants"
import type { GraphFilter } from "../../filters"
import type { ArchitectGraph } from "../../graph"
import { useDiagramLayout, useDiagramPositions } from "../../hooks/useDiagramLayout"
import { ArchitectCanvas } from "./ArchitectCanvas"
import { ArchitectNodePanel } from "./ArchitectNodePanel"
import { ARCHITECT_CANVAS_CLASS } from "./ArchitectStates"
import { DiagramHighlightContext, type DiagramHighlight } from "./diagram-context"

interface ArchitectDiagramViewProps {
    workbenchId: string
    diagramId: string
    graph: ArchitectGraph
    view: ArchitectView
    filter: GraphFilter
    showFiles: boolean
}

/**
 * Diagrama interativo de uma versão: foco no hover (destaca as arestas do nó e esmaece o resto),
 * clique abre o painel lateral, arrastar reorganiza (posição salva no navegador), grupos recolhem e
 * expandem, "Ajustar visão" e "Restaurar layout". Precisa estar dentro de um `ReactFlowProvider`.
 */
export function ArchitectDiagramView({ workbenchId, diagramId, graph, view, filter, showFiles }: ArchitectDiagramViewProps) {
    const reducedMotion = Boolean(useReducedMotion())
    const flow = useReactFlow()
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
    const [focusedId, setFocused] = useState<string | null>(null)
    const [selectedId, setSelected] = useState<string | null>(null)
    const [layoutRun, setLayoutRun] = useState(0)
    const { viewGraph, layout } = useDiagramLayout(graph, view, filter, collapsed)
    const positions = useDiagramPositions(workbenchId, diagramId, view)
    const toggleGroup = (groupId: string) => {
        setFocused(null)
        setSelected(null)
        setCollapsed((current) => {
            const next = new Set(current)
            if (next.has(groupId)) next.delete(groupId)
            else next.add(groupId)
            return next
        })
    }
    const highlight = useMemo<DiagramHighlight>(() => {
        const relatedNodes = new Set<string>()
        const relatedEdges = new Set<string>()
        if (focusedId) {
            for (const edge of viewGraph.edges) {
                if (edge.source !== focusedId && edge.target !== focusedId) continue
                relatedEdges.add(edge.id)
                relatedNodes.add(edge.source === focusedId ? edge.target : edge.source)
            }
        }
        return { focusedId, relatedNodes, relatedEdges, selectedId, reducedMotion, showFiles, onToggleGroup: toggleGroup }
        // `toggleGroup` só usa setters estáveis.
    }, [focusedId, selectedId, viewGraph, reducedMotion, showFiles])
    const canvasKey = `${diagramId}:${view}:${filter.kinds.join(",")}:${filter.onlyChanges}:${[...collapsed].sort().join(",")}:${layoutRun}`
    const fit = () => void flow.fitView({ padding: 0.15, duration: reducedMotion ? 0 : 300 })

    return (
        <DiagramHighlightContext.Provider value={highlight}>
            <div className={ARCHITECT_CANVAS_CLASS}>
                {viewGraph.nodes.length === 0 ? (
                    <p className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">Nenhum nó com os filtros escolhidos.</p>
                ) : (
                    <ArchitectCanvas key={canvasKey} layout={layout} view={viewGraph} positions={positions.positions} onSavePosition={positions.save} onFocus={setFocused} onSelect={setSelected} />
                )}
                <div className="absolute left-2 top-2 z-10 flex gap-1">
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 bg-card" onClick={fit}>
                        <Maximize className="h-3.5 w-3.5" aria-hidden /> Ajustar visão
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 bg-card"
                        disabled={Object.keys(positions.positions).length === 0}
                        onClick={() => {
                            positions.reset()
                            setLayoutRun((value) => value + 1)
                        }}
                    >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar layout
                    </Button>
                </div>
                <ArchitectNodePanel graph={graph} nodeId={selectedId} showFiles={showFiles} onClose={() => setSelected(null)} onSelect={setSelected} onCollapseGroup={toggleGroup} />
            </div>
        </DiagramHighlightContext.Provider>
    )
}
