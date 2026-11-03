"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ChevronDown, RotateCcw } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { ADOPTION_STALE_DAYS, type AgentActivityDto } from "@/features/engramind/agent-activity"
import { formatDateTime, formatRelative } from "@/features/engramind/components/shared/format"
import type { MemoryIdentity } from "../../agents"

/** Grade de estatísticas da adoção (o skeleton usa as mesmas classes). */
export const ACTIVITY_GRID = "grid grid-cols-1 gap-2 sm:grid-cols-3"
export const ACTIVITY_CELL = "min-h-[3.25rem] rounded-md border px-3 py-2"

const ID_PREVIEW = 8

function Stat({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
    return (
        <div className={ACTIVITY_CELL}>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold" data-testid={testId}>
                {children}
            </p>
        </div>
    )
}

function IdList({ label, ids }: { label: string; ids: string[] }) {
    const shown = ids.slice(0, ID_PREVIEW)
    return (
        <p className="break-words">
            <span className="text-muted-foreground">{label}: </span>
            {ids.length ? (
                <>
                    <code className="font-mono">{shown.join(", ")}</code>
                    {ids.length > shown.length && <span className="text-muted-foreground"> +{ids.length - shown.length}</span>}
                </>
            ) : (
                "nenhuma"
            )}
        </p>
    )
}

/** Última entrega do contexto (rastreio por turno): só ids, faixas, canais e `version`. */
function DeliveryDetails({ activity }: { activity: AgentActivityDto }) {
    const delivery = activity.delivery
    if (!delivery) return <p className="text-xs text-muted-foreground">Nenhuma entrega registrada.</p>
    return (
        <div className="space-y-1 text-xs" data-testid="delivery-details">
            <p>
                <span className="text-muted-foreground">Faixas: </span>
                {delivery.counts.full} com texto · {delivery.counts.titles} só título · {delivery.counts.overflow} fora do bloco
            </p>
            <IdList label="Texto completo" ids={delivery.fullIds} />
            <IdList label="Só título" ids={delivery.titleIds} />
            <p className="break-words">
                <span className="text-muted-foreground">Canais: </span>
                {delivery.channels.join(", ") || "—"}
            </p>
            <p className="break-words">
                <span className="text-muted-foreground">Versão: </span>
                <code className="font-mono">{delivery.version || "—"}</code>
                {delivery.focusMode && <span className="text-muted-foreground"> · foco {delivery.focusMode}</span>}
                <span className="text-muted-foreground"> · {formatDateTime(delivery.at)}</span>
            </p>
        </div>
    )
}

/** Adoção do aprendizado autônomo de um agente (OPE-117): gravações em 7 dias, última gravação e último contexto lido. */
export function AgentMemoryActivity({ agent, activity, loading, error = false, onRetry }: { agent: MemoryIdentity; activity: AgentActivityDto | undefined; loading: boolean; error?: boolean; onRetry?: () => void }) {
    const [open, setOpen] = useState(false)
    if (loading) return <AgentMemoryActivitySkeleton />
    // Falha ao carregar não vira "0 / Nunca" (pareceria que o agente nunca gravou).
    if (error && !activity)
        return (
            <div role="alert" data-testid={`agent-activity-error-${agent}`} className={cn(ACTIVITY_CELL, "flex flex-wrap items-center gap-2 text-xs text-destructive")}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> Não foi possível carregar a adoção do aprendizado.
                {onRetry && (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetry}>
                        <RotateCcw className="mr-1 h-3 w-3" aria-hidden /> Tentar novamente
                    </Button>
                )}
            </div>
        )
    const row: AgentActivityDto = activity ?? { agent, total: 0, last7d: 0, lastWriteAt: null, delivery: null, selfMemory: null, stale: false }
    return (
        <div className="space-y-2" data-testid={`agent-activity-${agent}`}>
            <div className={ACTIVITY_GRID}>
                <Stat label="Memórias gravadas (7d)" testId="activity-7d">
                    <AnimatedNumber value={row.last7d} />
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">de {row.total} no total</span>
                </Stat>
                <Stat label="Última gravação" testId="activity-last-write">
                    {row.lastWriteAt ? <span title={formatDateTime(row.lastWriteAt)}>{formatRelative(row.lastWriteAt)}</span> : "Nunca"}
                </Stat>
                <Stat label="Último contexto lido" testId="activity-last-context">
                    {row.delivery ? <span title={formatDateTime(row.delivery.at)}>{formatRelative(row.delivery.at)}</span> : "Nunca"}
                </Stat>
            </div>
            <AnimatePresence initial={false}>
                {row.stale && (
                    <motion.p
                        key="stale"
                        role="status"
                        data-testid="activity-stale"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-1.5 text-xs text-warning"
                    >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> Aprendizado ligado, mas sem gravações há {ADOPTION_STALE_DAYS} dias ou mais.
                    </motion.p>
                )}
            </AnimatePresence>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                <ChevronDown className={cn("mr-1 h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden /> Última entrega
            </Button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div key="delivery" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden rounded-md bg-muted/30 px-3 py-2">
                        <DeliveryDetails activity={row} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export function AgentMemoryActivitySkeleton() {
    return (
        <div className="space-y-2" aria-busy="true" data-testid="agent-activity-skeleton">
            <div className={ACTIVITY_GRID}>
                {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className={cn(ACTIVITY_CELL, "border-0")} />
                ))}
            </div>
            <Skeleton className="h-7 w-28" />
        </div>
    )
}
