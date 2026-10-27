"use client"

import { createContext, useContext, useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AnimatePresence, motion } from "framer-motion"
import { FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { WorkbenchDto } from "@/features/agentic/types"
import { ADVERSARIAL_DECISION_LABELS, ADVERSARIAL_LEVEL_DEFS } from "../../constants"
import { useAdversarialRealtime, useWorkbenchAdversarialReviews } from "../../hooks/useAdversarial"
import { formatCost, formatDuration } from "../ReviewBadges"
import { ReviewDetailDialog } from "../ReviewDetailDialog"
import { ReviewFindingsBody } from "../ReviewFindingsBody"
import { VerdictCard, type VerdictTone } from "../VerdictCard"

/**
 * Aba "Adversário (N)" da mesa: aparece sempre que a mesa tiver rodadas gravadas (mesmo com o
 * adversário desativado depois). `count` é o total de rodadas da mesa.
 */
export function useAdversarialTab(workbench: Pick<WorkbenchDto, "id">): { visible: boolean; count: number } {
    const query = useWorkbenchAdversarialReviews(workbench.id, true)
    useAdversarialRealtime(true)
    const count = query.data?.length ?? 0
    return { visible: count > 0, count }
}

/** Abre a aba do adversário numa rodada (card do veredito na saída). Sem provedor, o card usa o diálogo. */
const AdversarialTabNavContext = createContext<((reviewId: string) => void) | null>(null)
export const AdversarialTabNavProvider = AdversarialTabNavContext.Provider
export const useAdversarialTabNav = () => useContext(AdversarialTabNavContext)

interface AdversarialRoundsViewProps {
    workbenchId: string
    /** Rodada escolhida (`null` = a mais recente). */
    selectedId: string | null
    onSelect: (reviewId: string) => void
}

/** Saída final de cada rodada do agente adversário na mesa (a mais recente por padrão), como a aba do plano. */
export function AdversarialRoundsView({ workbenchId, selectedId, onSelect }: AdversarialRoundsViewProps) {
    const query = useWorkbenchAdversarialReviews(workbenchId, true)
    const reviews = query.data ?? []
    const [reportId, setReportId] = useState<string | null>(null)
    if (query.isLoading) return <Skeleton className="m-4 h-48" />
    if (query.isError) return <ErrorState title="Não foi possível carregar as revisões" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    const latest = reviews.at(-1)
    const review = reviews.find((item) => item.id === selectedId) ?? latest
    if (!review || !latest) return null
    const running = review.state === "running"
    const tone: VerdictTone = running ? "running" : review.state === "failed" || review.state === "interrupted" ? "failed" : review.blocking > 0 ? "blocked" : "approved"
    const outcome = running ? "Revisando…" : review.decision ? ADVERSARIAL_DECISION_LABELS[review.decision] : ""
    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    Gerada em {format(new Date(review.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {!running && (
                        <span className="tabular-nums">
                            {" · "}
                            {formatCost(review.costUsd)} · {formatDuration(review.durationMs)}
                        </span>
                    )}
                </p>
                {reviews.length > 1 && (
                    <Select value={review.id} onValueChange={(value) => value && onSelect(value)}>
                        <SelectTrigger className="w-52" aria-label="Rodada do agente adversário">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[...reviews].reverse().map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                    Ciclo {item.cycle} · rodada {item.round}
                                    {item.id === latest.id ? " (atual)" : ""}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={`${review.id}-${review.state}`} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }}>
                    <VerdictCard
                        round={review.round}
                        level={ADVERSARIAL_LEVEL_DEFS[review.level].label}
                        outcome={outcome}
                        tone={tone}
                        actions={
                            review.report ? (
                                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1" onClick={() => setReportId(review.id)}>
                                    <FileText className="h-3.5 w-3.5" aria-hidden /> Relatório completo
                                </Button>
                            ) : null
                        }
                    >
                        {running ? (
                            <div className="space-y-2" aria-busy="true">
                                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Revisando… o resultado aparece aqui quando a rodada terminar.
                                </p>
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-16 w-full" />
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <ReviewFindingsBody review={review} />
                            </div>
                        )}
                    </VerdictCard>
                </motion.div>
            </AnimatePresence>
            <ReviewDetailDialog id={reportId} initialView="report" onClose={() => setReportId(null)} />
        </div>
    )
}
