"use client"

import { useState } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import { AnimatePresence, motion } from "framer-motion"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { WorkbenchDto } from "@/features/agentic/types"
import { ARCHITECT_NODE_KINDS, type ArchitectDepth, type ArchitectView } from "../../constants"
import type { GraphFilter } from "../../filters"
import { useArchitectRealtime, useArchitectSettings, useGenerateDiagram, useRetryDiagram, useWorkbenchDiagrams } from "../../hooks/useArchitect"
import { DEFAULT_ARCHITECT_SETTINGS } from "../../schemas"
import type { ArchitectGraph } from "../../graph"
import { useLiveDiagram } from "../../hooks/useLiveDiagram"
import type { ArchitectDiagramDto, ArchitectLiveProgress } from "../../types"
import { ArchitectAdjustComposer } from "./ArchitectAdjustComposer"
import { ArchitectDiagramPane } from "./ArchitectDiagramPane"
import { ArchitectCanvasSkeleton, ArchitectEmpty, ArchitectFailed, ArchitectLiveWaiting } from "./ArchitectStates"
import { ArchitectVersionSelect } from "./ArchitectToolbar"
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
    const [selectedId, setSelected] = useState<string | null>(null)
    const [viewChoice, setView] = useState<ArchitectView | null>(null)
    const [filterChoice, setFilter] = useState<GraphFilter | null>(null)
    const defaults = settings.data?.settings.diagram ?? DEFAULT_ARCHITECT_SETTINGS.diagram
    const view = viewChoice ?? defaults.defaultView
    const filter: GraphFilter = filterChoice ?? { kinds: defaults.nodeKinds.length ? defaults.nodeKinds : [...ARCHITECT_NODE_KINDS], onlyChanges: false }
    const canGenerate = canGenerateOn(workbench)
    const diagrams = query.data ?? []
    const diagram = diagrams.find((item) => item.id === selectedId) ?? diagrams.at(-1)
    // Versão gerando (e não a provisória da resposta otimista): o diagrama chega ao vivo pelo stream.
    const liveId = diagram?.state === "running" && !diagram.id.startsWith("pending-") ? diagram.id : null
    const live = useLiveDiagram(workbench.id, liveId)

    if (query.isLoading) return <ArchitectCanvasSkeleton />
    if (query.isError) return <ErrorState title="Não foi possível carregar a arquitetura" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    const busy = diagrams.some((item) => item.state === "running") || generate.isPending
    const request = async (input: { depth?: ArchitectDepth; feedback?: string; baseDiagramId?: string }) => {
        const saved = await generate.mutateAsync(input).catch(() => null)
        if (saved) setSelected(null)
        return Boolean(saved)
    }

    if (!diagram) return <ArchitectEmpty canGenerate={canGenerate} reason={emptyReason(workbench)} defaultDepth={asDepth(defaults.depth)} pending={generate.isPending} onGenerate={(depth) => void request({ depth })} />

    const pane = (current: ArchitectDiagramDto, graph: ArchitectGraph, liveInfo: { progress: ArchitectLiveProgress | null; connected: boolean } | null) => (
        <ArchitectDiagramPane
            workbenchId={workbench.id}
            taskCode={workbench.taskCode}
            diagrams={diagrams}
            diagram={current}
            graph={graph}
            view={view}
            onViewChange={setView}
            filter={filter}
            onFilterChange={setFilter}
            onSelect={setSelected}
            showFiles={defaults.showFiles}
            showNotes={defaults.showNotes}
            live={liveInfo}
        />
    )
    const picker = (current: ArchitectDiagramDto) =>
        diagrams.length > 1 ? (
            <div className="flex justify-end px-4 pt-4">
                <ArchitectVersionSelect diagrams={diagrams} diagram={current} onSelect={setSelected} />
            </div>
        ) : null

    // Pronto ou ao vivo com nós: o mesmo painel (o grafo final entra sem remontar o canvas).
    const running = diagram.state === "running"
    const liveGraph = running ? (live.graph ?? diagram.draft) : null
    const shown = diagram.state === "done" ? diagram.graph : liveGraph?.nodes.length ? liveGraph : null
    const mode = shown ? "diagram" : running ? "waiting" : "failed"
    const body = () => {
        if (mode === "diagram" && shown)
            return (
                <ReactFlowProvider>
                    {pane(diagram, shown, running ? { progress: live.progress ?? { phase: diagram.phase, tools: diagram.tools, nodes: shown.nodes.length, edges: shown.edges.length }, connected: live.connected || live.graph === null } : null)}
                    {canGenerate && <ArchitectAdjustComposer defaultDepth={asDepth(diagram.depth)} pending={generate.isPending} disabled={busy} onSubmit={({ feedback, depth }) => request({ feedback, depth, baseDiagramId: diagram.id })} />}
                </ReactFlowProvider>
            )
        if (mode === "waiting")
            return (
                <>
                    {picker(diagram)}
                    <ArchitectLiveWaiting phase={live.progress?.phase ?? diagram.phase} tools={live.progress?.tools ?? diagram.tools} connected={live.connected || live.graph === null} />
                </>
            )
        const depth = asDepth(diagram.depth)
        const failed = (
            <ArchitectFailed
                diagram={diagram}
                pending={retry.isPending || busy}
                canRetry={canGenerate}
                onRetry={() => retry.mutate(diagram.id)}
                onDeeper={depth < 5 ? () => void request({ depth: asDepth(depth + 1) }) : null}
            />
        )
        return (
            <>
                {picker(diagram)}
                {diagram.draft?.nodes.length ? (
                    // O rascunho desenhado até a falha fica esmaecido atrás da mensagem, como contexto.
                    <div className="relative flex min-h-0 flex-1 flex-col">
                        <div className="pointer-events-none flex min-h-0 flex-1 flex-col opacity-30" aria-hidden data-testid="architect-failed-draft">
                            <ReactFlowProvider>{pane(diagram, diagram.draft, null)}</ReactFlowProvider>
                        </div>
                        <div className="absolute inset-0 flex flex-col bg-background/60 backdrop-blur-[1px]">{failed}</div>
                    </div>
                ) : (
                    failed
                )}
            </>
        )
    }

    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${diagram.id}-${mode}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex min-h-0 flex-1 flex-col">
                {body()}
            </motion.div>
        </AnimatePresence>
    )
}
