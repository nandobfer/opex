"use client"

import { useRef } from "react"
import type { ArchitectView } from "../../constants"
import type { GraphFilter } from "../../filters"
import type { ArchitectGraph } from "../../graph"
import type { ArchitectDiagramDto, ArchitectLiveProgress } from "../../types"
import { ArchitectDiagramView } from "./ArchitectDiagramView"
import { ArchitectExportMenu } from "./ArchitectExportMenu"
import { ArchitectNotes } from "./ArchitectNotes"
import { ARCHITECT_TAB_CLASS } from "./ArchitectStates"
import { ArchitectToolbar } from "./ArchitectToolbar"

interface ArchitectDiagramPaneProps {
    workbenchId: string
    taskCode: string
    diagrams: readonly ArchitectDiagramDto[]
    diagram: ArchitectDiagramDto
    graph: ArchitectGraph
    view: ArchitectView
    onViewChange: (view: ArchitectView) => void
    filter: GraphFilter
    onFilterChange: (filter: GraphFilter) => void
    onSelect: (id: string) => void
    showFiles: boolean
    showNotes: boolean
    /** Geração ao vivo (sem exportação até terminar). */
    live?: { progress: ArchitectLiveProgress | null; connected: boolean } | null
}

/**
 * Diagrama de uma versão (ao vivo ou pronto): título, resumo, barra, notas e o canvas. É o MESMO
 * componente nas duas situações, então a chegada do grafo final não remonta o canvas.
 */
export function ArchitectDiagramPane({ workbenchId, taskCode, diagrams, diagram, graph, view, onViewChange, filter, onFilterChange, onSelect, showFiles, showNotes, live = null }: ArchitectDiagramPaneProps) {
    const canvasRef = useRef<HTMLDivElement>(null)
    return (
        <div className={ARCHITECT_TAB_CLASS}>
            <div>
                <p className="text-sm font-medium">{graph.title || "Desenhando a arquitetura do plano…"}</p>
                {graph.summary && <p className="text-xs text-muted-foreground">{graph.summary}</p>}
            </div>
            <ArchitectToolbar diagrams={diagrams} diagram={diagram} onSelect={onSelect} view={view} onViewChange={onViewChange} filter={filter} onFilterChange={onFilterChange}>
                {!live && <ArchitectExportMenu graph={graph} fileName={`${taskCode.toLowerCase()}-arquitetura-v${diagram.version}`} container={() => canvasRef.current} />}
            </ArchitectToolbar>
            {showNotes && <ArchitectNotes notes={graph.notes} />}
            <div ref={canvasRef} className="flex min-h-[420px] flex-1 flex-col">
                <ArchitectDiagramView workbenchId={workbenchId} diagramId={diagram.id} graph={graph} view={view} filter={filter} showFiles={showFiles} live={live} />
            </div>
        </div>
    )
}
