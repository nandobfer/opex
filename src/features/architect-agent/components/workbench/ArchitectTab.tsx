"use client"

import { useRef, useState } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import { AnimatePresence, motion } from "framer-motion"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { WorkbenchDto } from "@/features/agentic/types"
import { ARCHITECT_NODE_KINDS, type ArchitectDepth, type ArchitectView } from "../../constants"
import type { GraphFilter } from "../../filters"
import { useArchitectRealtime, useArchitectSettings, useGenerateDiagram, useRetryDiagram, useWorkbenchDiagrams } from "../../hooks/useArchitect"
import { DEFAULT_ARCHITECT_SETTINGS } from "../../schemas"
import type { ArchitectDiagramDto } from "../../types"
import { ArchitectAdjustComposer } from "./ArchitectAdjustComposer"
import { ArchitectDiagramView } from "./ArchitectDiagramView"
import { ArchitectExportMenu } from "./ArchitectExportMenu"
import { ArchitectNotes } from "./ArchitectNotes"
import { ArchitectCanvasSkeleton, ArchitectEmpty, ArchitectFailed, ArchitectGenerating, ARCHITECT_TAB_CLASS } from "./ArchitectStates"
import { ArchitectToolbar, ArchitectVersionSelect } from "./ArchitectToolbar"
import { asDepth } from "./DepthControl"

type ArchitectWorkbench = Pick<WorkbenchDto, "id" | "taskCode" | "architect">

const canGenerateOn = (workbench: ArchitectWorkbench) => Boolean(workbench.architect?.applies && workbench.architect.approvedPlanVersion)

/**
 * Aba "Arquitetura (N)" da mesa: aparece quando a mesa tem diagrama (ou geração em andamento) ou
 * quando o arquiteto se aplica e há plano aprovado (estado vazio com "Gerar arquitetura").
 */
export function useArchitectTab(workbench: ArchitectWorkbench): { visible: boolean; count: number } {
    const query = useWorkbenchDiagrams(workbench.id)
    useArchitectRealtime(true)
    const count = query.data?.length ?? 0
    return { visible: count > 0 || canGenerateOn(workbench), count }
}

const emptyReason = (workbench: ArchitectWorkbench) =>
    canGenerateOn(workbench)
        ? "Gere o diagrama de arquitetura do plano aprovado. A implementação segue normalmente enquanto o agente desenha."
        : workbench.architect?.applies
          ? "A mesa ainda não tem plano aprovado: o diagrama é gerado a partir do plano aprovado."
          : "O Agente Arquiteto está desativado para esta central (Integrações › Inteligência Artificial › Agente Arquiteto)."

export function ArchitectTab({ workbench }: { workbench: ArchitectWorkbench }) {
    const query = useWorkbenchDiagrams(workbench.id)
    const settings = useArchitectSettings()
    const generate = useGenerateDiagram(workbench.id)
    const retry = useRetryDiagram(workbench.id)
    const canvasRef = useRef<HTMLDivElement>(null)
    const [selectedId, setSelected] = useState<string | null>(null)
    const [viewChoice, setView] = useState<ArchitectView | null>(null)
    const [filterChoice, setFilter] = useState<GraphFilter | null>(null)
    const defaults = settings.data?.settings.diagram ?? DEFAULT_ARCHITECT_SETTINGS.diagram
    const view = viewChoice ?? defaults.defaultView
    const filter: GraphFilter = filterChoice ?? { kinds: defaults.nodeKinds.length ? defaults.nodeKinds : [...ARCHITECT_NODE_KINDS], onlyChanges: false }
    const canGenerate = canGenerateOn(workbench)

    if (query.isLoading) return <ArchitectCanvasSkeleton />
    if (query.isError) return <ErrorState title="Não foi possível carregar a arquitetura" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    const diagrams = query.data ?? []
    const latest = diagrams.at(-1)
    const diagram = diagrams.find((item) => item.id === selectedId) ?? latest
    const busy = diagrams.some((item) => item.state === "running") || generate.isPending
    const request = async (input: { depth?: ArchitectDepth; feedback?: string; baseDiagramId?: string }) => {
        const saved = await generate.mutateAsync(input).catch(() => null)
        if (saved) setSelected(null)
        return Boolean(saved)
    }

    if (!diagram) return <ArchitectEmpty canGenerate={canGenerate} reason={emptyReason(workbench)} defaultDepth={asDepth(defaults.depth)} pending={generate.isPending} onGenerate={(depth) => void request({ depth })} />

    const picker = (current: ArchitectDiagramDto) =>
        diagrams.length > 1 ? (
            <div className="flex justify-end px-4 pt-4">
                <ArchitectVersionSelect diagrams={diagrams} diagram={current} onSelect={setSelected} />
            </div>
        ) : null
    const body = (current: ArchitectDiagramDto) => {
        if (current.state === "running")
            return (
                <>
                    {picker(current)}
                    <ArchitectGenerating diagram={current} />
                </>
            )
        if (current.state !== "done" || !current.graph) {
            const depth = asDepth(current.depth)
            return (
                <>
                {picker(current)}
                <ArchitectFailed
                    diagram={current}
                    pending={retry.isPending || busy}
                    canRetry={canGenerate}
                    onRetry={() => retry.mutate(current.id)}
                    onDeeper={depth < 5 ? () => void request({ depth: asDepth(depth + 1) }) : null}
                />
                </>
            )
        }
        const graph = current.graph
        return (
            <ReactFlowProvider>
                <div className={ARCHITECT_TAB_CLASS}>
                    <div>
                        <p className="text-sm font-medium">{graph.title}</p>
                        {graph.summary && <p className="text-xs text-muted-foreground">{graph.summary}</p>}
                    </div>
                    <ArchitectToolbar diagrams={diagrams} diagram={current} onSelect={setSelected} view={view} onViewChange={setView} filter={filter} onFilterChange={setFilter}>
                        <ArchitectExportMenu graph={graph} fileName={`${workbench.taskCode.toLowerCase()}-arquitetura-v${current.version}`} container={() => canvasRef.current} />
                    </ArchitectToolbar>
                    {defaults.showNotes && <ArchitectNotes notes={graph.notes} />}
                    <div ref={canvasRef} className="flex min-h-[420px] flex-1 flex-col">
                        <ArchitectDiagramView workbenchId={workbench.id} diagramId={current.id} graph={graph} view={view} filter={filter} showFiles={defaults.showFiles} />
                    </div>
                </div>
                {canGenerate && <ArchitectAdjustComposer defaultDepth={asDepth(current.depth)} pending={generate.isPending} disabled={busy} onSubmit={({ feedback, depth }) => request({ feedback, depth, baseDiagramId: current.id })} />}
            </ReactFlowProvider>
        )
    }

    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${diagram.id}-${diagram.state}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex min-h-0 flex-1 flex-col">
                {body(diagram)}
            </motion.div>
        </AnimatePresence>
    )
}
