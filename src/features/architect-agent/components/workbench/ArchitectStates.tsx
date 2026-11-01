"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, Loader2, Network, RotateCcw, Sparkles, ZoomIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FLOW_SURFACE_CLASS } from "@/components/flow/flow-theme"
import { ARCHITECT_PHASE_LABELS, type ArchitectDepth } from "../../constants"
import type { ArchitectDiagramDto } from "../../types"
import { DepthControl } from "./DepthControl"

/** Estados da aba Arquitetura: carregando/gerando (skeleton no formato do canvas), falhou e vazio. */

/** Classes do contêiner da aba (o skeleton usa as mesmas do resultado final). */
export const ARCHITECT_TAB_CLASS = "flex min-h-0 flex-1 flex-col gap-3 p-4"
export const ARCHITECT_CANVAS_CLASS = `${FLOW_SURFACE_CLASS} min-h-0 flex-1`

/** Colunas de cartões no formato das camadas do diagrama (nunca um grafo parcial). */
export function ArchitectCanvasSkeleton({ label }: { label?: string }) {
    const columns = [1, 3, 4, 2]
    return (
        <div className={ARCHITECT_TAB_CLASS} aria-busy="true">
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="ml-auto h-8 w-24" />
                </div>
                <Skeleton className="h-3 w-80" />
            </div>
            <div className={ARCHITECT_CANVAS_CLASS} data-testid="architect-skeleton">
                <div className="flex h-full items-center justify-center gap-16 p-8">
                    {columns.map((count, column) => (
                        <div key={column} className="flex flex-col gap-4">
                            {Array.from({ length: count }, (_, row) => (
                                <Skeleton key={row} className="h-[68px] w-[180px] rounded-lg" />
                            ))}
                        </div>
                    ))}
                </div>
                {label && (
                    <p className="absolute inset-x-0 top-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
                    </p>
                )}
            </div>
        </div>
    )
}

export function ArchitectGenerating({ diagram }: { diagram: ArchitectDiagramDto }) {
    const phase = diagram.phase ? ARCHITECT_PHASE_LABELS[diagram.phase] : ARCHITECT_PHASE_LABELS.starting
    return <ArchitectCanvasSkeleton label={`${phase}${diagram.tools ? ` (${diagram.tools} leitura(s))` : ""} O diagrama aparece aqui quando ficar pronto.`} />
}

export function ArchitectFailed({ diagram, pending, canRetry, onRetry, onDeeper }: { diagram: ArchitectDiagramDto; pending: boolean; canRetry: boolean; onRetry: () => void; onDeeper: (() => void) | null }) {
    return (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
            <div className="rounded-full bg-destructive/10 p-3">
                <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
            </div>
            <p className="font-medium">{diagram.state === "interrupted" ? "A geração da arquitetura foi interrompida" : "Não foi possível gerar a arquitetura"}</p>
            {diagram.error && <p className="max-w-xl text-sm text-muted-foreground">{diagram.error}</p>}
            <p className="text-xs text-muted-foreground">A mesa segue normalmente: o diagrama não bloqueia o desenvolvimento.</p>
            {canRetry && (
                <div className="flex flex-wrap justify-center gap-2">
                    <Button type="button" size="sm" className="gap-1.5" disabled={pending} onClick={onRetry}>
                        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />} Tentar novamente
                    </Button>
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
