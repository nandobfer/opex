"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { AlertTriangle, Loader2, Network, RotateCcw, Sparkles, ZoomIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FLOW_SURFACE_CLASS } from "@/components/flow/flow-theme"
import { type ArchitectDepth, type ArchitectPhase } from "../../constants"
import type { ArchitectDiagramDto } from "../../types"
import { NODE_SIZE_STYLE } from "../../layout"
import { DepthControl } from "./DepthControl"
import { ArchitectLiveBar } from "./ArchitectLiveBar"
import { ARCHITECT_CANVAS_TOOLBAR_CLASS } from "./ArchitectCanvasToolbar"
import { ARCHITECT_HEADER_CLASS, ARCHITECT_HEADER_ROW_CLASS } from "./ArchitectHeader"

/** Estados da aba Arquitetura: carregando (skeleton no formato do canvas), esperando o primeiro nó, falhou e vazio. */

/**
 * Classes do contêiner da aba (o skeleton usa as mesmas do resultado final). A aba rola quando a tela é
 * baixa demais: o canvas nunca vaza por baixo da barra de ações da mesa.
 */
export const ARCHITECT_TAB_CLASS = "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4"
/** O canvas fica com todo o resto da altura da aba; o piso só vale em telas muito baixas. */
export const ARCHITECT_CANVAS_WRAP_CLASS = "flex min-h-[360px] flex-1 flex-col"
export const ARCHITECT_CANVAS_CLASS = `${FLOW_SURFACE_CLASS} min-h-0 flex-1`

/** Cabeçalho compacto e barra de controles dentro do canvas, no formato do resultado final. */
function HeaderSkeleton() {
    return (
        <div className={ARCHITECT_HEADER_CLASS}>
            <div className={ARCHITECT_HEADER_ROW_CLASS}>
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className={ARCHITECT_HEADER_ROW_CLASS}>
                <Skeleton className="h-3 w-96 max-w-full" />
                <Skeleton className="ml-auto h-7 w-52" />
            </div>
        </div>
    )
}

/** Um bloco por controle da barra final: visão, filtros, exportar, ajustar visão, restaurar layout, pedir ajustes e tela cheia. */
function ToolbarSkeleton() {
    return (
        <div className={ARCHITECT_CANVAS_TOOLBAR_CLASS}>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-7 w-28" />
        </div>
    )
}

/** Colunas de cartões no formato das camadas do diagrama (nunca um grafo parcial). */
export function ArchitectCanvasSkeleton({ label }: { label?: string }) {
    const columns = [1, 3, 4, 2]
    return (
        <div className={ARCHITECT_TAB_CLASS} aria-busy="true">
            <HeaderSkeleton />
            <div className={ARCHITECT_CANVAS_WRAP_CLASS}>
                <div className={ARCHITECT_CANVAS_CLASS} data-testid="architect-skeleton">
                    <ToolbarSkeleton />
                    <div className="flex h-full items-center justify-center gap-16 p-8">
                        {columns.map((count, column) => (
                            <div key={column} className="flex flex-col gap-4">
                                {Array.from({ length: count }, (_, row) => (
                                    <Skeleton key={row} className="rounded-lg" style={NODE_SIZE_STYLE} />
                                ))}
                            </div>
                        ))}
                    </div>
                    {label && (
                        <p className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

/**
 * Geração em curso antes do primeiro nó (o agente lendo o plano e o código): o próprio canvas, no
 * formato final, com o nó do objetivo "fantasma" pulsando no centro. Os nós aparecem aqui ao vivo.
 */
export function ArchitectLiveWaiting({ phase, tools, connected, provider = null }: { phase: ArchitectPhase | null; tools: number; connected: boolean; provider?: string | null }) {
    const reducedMotion = useReducedMotion()
    return (
        <div className={ARCHITECT_TAB_CLASS} aria-busy="true">
            <HeaderSkeleton />
            <div className={ARCHITECT_CANVAS_WRAP_CLASS}>
                <div className={ARCHITECT_CANVAS_CLASS} data-testid="architect-live-waiting">
                    <ToolbarSkeleton />
                    <ArchitectLiveBar progress={{ phase: phase ?? "starting", tools, nodes: 0, edges: 0 }} connected={connected} provider={provider} />
                    <div className="flex h-full items-center justify-center p-8">
                        <motion.div
                            style={NODE_SIZE_STYLE}
                            className="flex items-center gap-2 rounded-lg border border-dashed border-primary/60 bg-primary/10 px-3 text-xs text-muted-foreground"
                            animate={reducedMotion ? undefined : { opacity: [0.45, 1, 0.45], scale: [0.98, 1, 0.98] }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                        >
                            <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />O diagrama vai sendo desenhado aqui
                        </motion.div>
                    </div>
                </div>
            </div>
        </div>
    )
}

/**
 * `currentPlan`: plano mais novo da mesa. Uma versão automática de um plano já substituído não oferece
 * "Tentar novamente" (o resultado seria descartado): oferece gerar do plano atual.
 */
export function ArchitectFailed({ diagram, pending, canRetry, currentPlan = null, onRetry, onCurrent, onDeeper }: { diagram: ArchitectDiagramDto; pending: boolean; canRetry: boolean; currentPlan?: number | null; onRetry: () => void; onCurrent?: () => void; onDeeper: (() => void) | null }) {
    const outdated = diagram.origin === "auto" && currentPlan !== null && currentPlan > diagram.planVersion
    return (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
            <div className="rounded-full bg-destructive/10 p-3">
                <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
            </div>
            <p className="font-medium">{diagram.state === "interrupted" ? "A geração da arquitetura foi interrompida" : "Não foi possível gerar a arquitetura"}</p>
            {diagram.error && <p className="max-w-xl text-sm text-muted-foreground">{diagram.error}</p>}
            <p className="text-xs text-muted-foreground">A mesa segue normalmente: o diagrama não bloqueia o desenvolvimento.</p>
            {outdated && <p className="text-xs text-muted-foreground">Esta versão é do plano v{diagram.planVersion}; o plano v{currentPlan} já é o mais novo.</p>}
            {canRetry && (
                <div className="flex flex-wrap justify-center gap-2">
                    {outdated ? (
                        <Button type="button" size="sm" className="gap-1.5" disabled={pending} onClick={onCurrent}>
                            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />} Gerar do plano atual
                        </Button>
                    ) : (
                        <Button type="button" size="sm" className="gap-1.5" disabled={pending} onClick={onRetry}>
                            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />} Tentar novamente
                        </Button>
                    )}
                    {onDeeper && (
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={onDeeper}>
                            <ZoomIn className="h-3.5 w-3.5" aria-hidden /> Regerar com profundidade maior
                        </Button>
                    )}
                </div>
            )}
        </motion.div>
    )
}

export function ArchitectEmpty({ canGenerate, reason, defaultDepth, pending, onGenerate }: { canGenerate: boolean; reason: string; defaultDepth: ArchitectDepth; pending: boolean; onGenerate: (depth: ArchitectDepth) => void }) {
    // Só a escolha do usuário fica no estado: até ele mexer, vale o padrão (que pode chegar depois da montagem).
    const [choice, setChoice] = useState<ArchitectDepth | null>(null)
    const depth = choice ?? defaultDepth
    return (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="rounded-full bg-muted p-3">
                <Network className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
            <p className="font-medium">Sem diagrama de arquitetura</p>
            <p className="max-w-md text-sm text-muted-foreground">{reason}</p>
            {canGenerate && (
                <div className="w-full max-w-md space-y-3">
                    <DepthControl id="architect-empty-depth" value={depth} onChange={setChoice} disabled={pending} />
                    <Button type="button" size="sm" className="gap-1.5" disabled={pending} onClick={() => onGenerate(depth)}>
                        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />} Gerar arquitetura
                    </Button>
                </div>
            )}
        </motion.div>
    )
}
