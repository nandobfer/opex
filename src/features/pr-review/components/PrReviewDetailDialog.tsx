"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ExternalLink, FileText } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Markdown } from "@/components/ui/markdown"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { Timeline } from "@/features/agentic/components/workbench/Timeline"
import { usePrReview, usePrReviewStream } from "../hooks/usePrReview"
import { PrReviewStateBadge, PrReviewVerdictBadge } from "./PrReviewBadges"
import { formatCost, formatDuration } from "./PrReviewRow"

type View = "output" | "report"
const VIEWS = [
    { value: "output" as const, label: "Saída do agente" },
    { value: "report" as const, label: "Relatório" },
]

/** Detalhe da revisão: saída do agente ao vivo e o relatório final. */
export function PrReviewDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
    const query = usePrReview(id)
    const { timeline } = usePrReviewStream(id)
    const review = query.data
    const running = review?.state === "running"
    // Aba escolhida vale só para a revisão aberta; sem escolha, revisão concluída abre no relatório.
    const [chosen, setChosen] = useState<{ id: string; view: View } | null>(null)
    const view: View = chosen && chosen.id === id ? chosen.view : review?.state === "done" && review.report ? "report" : "output"
    const setView = (next: View) => id && setChosen({ id, view: next })

    return (
        <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                        {review ? (
                            <>
                                <a href={review.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                                    {review.repo}#{review.number} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                </a>
                                <PrReviewStateBadge state={review.state} />
                                <PrReviewVerdictBadge verdict={review.verdict} />
                            </>
                        ) : (
                            "Revisão de PR"
                        )}
                    </DialogTitle>
                    <DialogDescription>{review ? `${review.title} · commit ${review.headSha.slice(0, 7)} · ${formatCost(review.costUsd)} · ${formatDuration(review.durationMs)}` : "Carregando…"}</DialogDescription>
                </DialogHeader>

                {query.isLoading ? (
                    <Skeleton className="h-80 w-full" />
                ) : query.isError || !review ? (
                    <ErrorState title="Não foi possível carregar a revisão" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : (
                    <>
                        <OptionTabs aria-label="Conteúdo da revisão" options={VIEWS} value={view} onChange={setView} className="w-full" />
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="flex h-[60vh] min-h-0 flex-col overflow-hidden rounded-xl border">
                                {view === "output" ? (
                                    <Timeline timeline={timeline} running={running} />
                                ) : review.report ? (
                                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                                        <Markdown>{review.report}</Markdown>
                                    </div>
                                ) : (
                                    <EmptyState icon={FileText} title="Sem relatório" description={running || review.state === "queued" ? "O relatório aparece quando a revisão terminar." : "O agente não produziu um relatório."} />
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
