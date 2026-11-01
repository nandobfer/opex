"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useReactFlow } from "@xyflow/react"
import { useReducedMotion } from "framer-motion"
import { LocateFixed, Maximize, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ArchitectView } from "../../constants"
import type { GraphFilter } from "../../filters"
import type { ArchitectGraph } from "../../graph"
import { useDiagramLayout, useDiagramPositions, useSettledGraph } from "../../hooks/useDiagramLayout"
import type { ArchitectLiveProgress } from "../../types"
import { ArchitectLiveBar } from "./ArchitectLiveBar"
import { ArchitectCanvasToolbar, CANVAS_TOOL_BUTTON_CLASS } from "./ArchitectCanvasToolbar"
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
    /** Geração ao vivo: o grafo cresce sem remontar, a câmera acompanha e o arrasto fica desligado. */
    live?: { progress: ArchitectLiveProgress | null; connected: boolean } | null
    /** Controles que abrem a barra dentro do canvas (visão, filtros, exportar), antes de "Ajustar visão". */
    controls?: ReactNode
}

/**
 * Diagrama interativo de uma versão: foco no hover (destaca as arestas do nó e esmaece o resto),
 * clique abre o painel lateral, arrastar reorganiza (posição salva no navegador), grupos recolhem e
 * expandem, "Ajustar visão" e "Restaurar layout". Precisa estar dentro de um `ReactFlowProvider`.
 */
export function ArchitectDiagramView({ workbenchId, diagramId, graph: incoming, view, filter, showFiles, live = null, controls = null }: ArchitectDiagramViewProps) {
    const isLive = Boolean(live)
    const graph = useSettledGraph(incoming, isLive)
    const [follow, setFollow] = useState(true)
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
        return { focusedId, relatedNodes, relatedEdges, selectedId, reducedMotion, live: isLive, showFiles, onToggleGroup: toggleGroup }
        // `toggleGroup` só usa setters estáveis.
    }, [focusedId, selectedId, viewGraph, reducedMotion, isLive, showFiles])
    const canvasKey = `${diagramId}:${view}:${filter.kinds.join(",")}:${filter.onlyChanges}:${[...collapsed].sort().join(",")}:${layoutRun}`
    const fit = () => void flow.fitView({ padding: 0.15, duration: reducedMotion ? 0 : 300 })
    // Ao vivo, a câmera acompanha o grafo crescendo até o usuário mover a visão.
    useEffect(() => {
        if (!isLive || !follow) return
        const timer = setTimeout(() => void flow.fitView({ padding: 0.15, duration: reducedMotion ? 0 : 400 }), 320)
        return () => clearTimeout(timer)
    }, [layout, isLive, follow, flow, reducedMotion])

    return (
        <DiagramHighlightContext.Provider value={highlight}>
            <div className={ARCHITECT_CANVAS_CLASS} data-testid="architect-canvas-frame">
                {viewGraph.nodes.length === 0 ? (
                    <p className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">Nenhum nó com os filtros escolhidos.</p>
                ) : (
                    <ArchitectCanvas key={canvasKey} layout={layout} view={viewGraph} positions={positions.positions} live={isLive} reducedMotion={reducedMotion} onSavePosition={positions.save} onFocus={setFocused} onSelect={setSelected} onUserMove={() => setFollow(false)} />
                )}
                {live && <ArchitectLiveBar progress={live.progress} connected={live.connected} />}
                <ArchitectCanvasToolbar>
                    {controls}
                    <Button type="button" variant="outline" size="sm" className={CANVAS_TOOL_BUTTON_CLASS} onClick={fit}>
                        <Maximize className="h-3.5 w-3.5" aria-hidden /> Ajustar visão
                    </Button>
                    {isLive && !follow && (
                        <Button type="button" variant="outline" size="sm" className={CANVAS_TOOL_BUTTON_CLASS} onClick={() => setFollow(true)}>
                            <LocateFixed className="h-3.5 w-3.5" aria-hidden /> Acompanhar
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={CANVAS_TOOL_BUTTON_CLASS}
                        disabled={isLive || Object.keys(positions.positions).length === 0}
                        onClick={() => {
                            positions.reset()
                            setLayoutRun((value) => value + 1)
                        }}
                    >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar layout
                    </Button>
                </ArchitectCanvasToolbar>
                <ArchitectNodePanel graph={graph} nodeId={selectedId} showFiles={showFiles} onClose={() => setSelected(null)} onSelect={setSelected} onCollapseGroup={toggleGroup} />
            </div>
        </DiagramHighlightContext.Provider>
    )
}
