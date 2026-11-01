"use client"

import { useRef } from "react"
import type { ArchitectView } from "../../constants"
import type { GraphFilter } from "../../filters"
import type { ArchitectGraph } from "../../graph"
import type { ArchitectDiagramDto, ArchitectLiveProgress } from "../../types"
import { ArchitectViewTabs } from "./ArchitectCanvasToolbar"
import { ArchitectDiagramView } from "./ArchitectDiagramView"
import { ArchitectExportMenu } from "./ArchitectExportMenu"
import { ArchitectFilterMenu } from "./ArchitectFilterMenu"
import { ArchitectHeader } from "./ArchitectHeader"
import { ARCHITECT_CANVAS_WRAP_CLASS, ARCHITECT_TAB_CLASS } from "./ArchitectStates"

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
 * Diagrama de uma versão (ao vivo ou pronto): cabeçalho compacto (título com o resumo na dica, dados da
 * versão e as notas à direita) e o canvas com a barra de controles dentro dele. É o MESMO componente
 * nas duas situações, então a chegada do grafo final não remonta o canvas.
 */
export function ArchitectDiagramPane({ workbenchId, taskCode, diagrams, diagram, graph, view, onViewChange, filter, onFilterChange, onSelect, showFiles, showNotes, live = null }: ArchitectDiagramPaneProps) {
    const canvasRef = useRef<HTMLDivElement>(null)
    const controls = (
        <>
            <ArchitectViewTabs view={view} onViewChange={onViewChange} />
            <ArchitectFilterMenu filter={filter} onFilterChange={onFilterChange} />
            <ArchitectExportMenu graph={graph} fileName={`${taskCode.toLowerCase()}-arquitetura-v${diagram.version}`} container={() => canvasRef.current} disabled={Boolean(live)} />
        </>
    )
    return (
        <div className={ARCHITECT_TAB_CLASS}>
            <ArchitectHeader diagrams={diagrams} diagram={diagram} graph={graph} onSelect={onSelect} showNotes={showNotes} />
            <div ref={canvasRef} className={ARCHITECT_CANVAS_WRAP_CLASS}>
                <ArchitectDiagramView workbenchId={workbenchId} diagramId={diagram.id} graph={graph} view={view} filter={filter} showFiles={showFiles} live={live} controls={controls} />
            </div>
        </div>
    )
}
