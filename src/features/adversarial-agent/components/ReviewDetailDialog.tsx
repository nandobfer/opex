"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Markdown } from "@/components/ui/markdown"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { ADVERSARIAL_LEVEL_DEFS } from "../constants"
import { useAdversarialReview } from "../hooks/useAdversarial"
import { DecisionBadge, formatCost, formatDuration } from "./ReviewBadges"
import { ReviewFindingsBody } from "./ReviewFindingsBody"

type View = "findings" | "report"
const VIEWS = [
    { value: "findings" as const, label: "Achados" },
    { value: "report" as const, label: "Relatório completo" },
]

/** Detalhe de uma rodada: achados (bloqueantes e sugestões), contestações e o texto do agente. */
export function ReviewDetailDialog({ id, onClose, initialView = "findings" }: { id: string | null; onClose: () => void; initialView?: View }) {
    const query = useAdversarialReview(id)
    const review = query.data
    // A aba escolhida vale só para a revisão aberta; ao abrir outra, volta para `initialView`.
    const [chosen, setChosen] = useState<{ id: string; view: View } | null>(null)
    const view: View = chosen && chosen.id === id ? chosen.view : initialView
    const setView = (next: View) => id && setChosen({ id, view: next })
    return (
        <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                        {review ? (
                            <>
                                {review.taskCode} · rodada {review.round} <DecisionBadge decision={review.decision} state={review.state} />
                            </>
                        ) : (
                            "Revisão do agente adversário"
                        )}
                    </DialogTitle>
                    <DialogDescription>{review ? `${review.taskTitle} · ${ADVERSARIAL_LEVEL_DEFS[review.level].label} · ${formatCost(review.costUsd)} · ${formatDuration(review.durationMs)}` : "Carregando…"}</DialogDescription>
                </DialogHeader>
                {query.isLoading ? (
                    <Skeleton className="h-64 w-full" />
                ) : query.isError || !review ? (
                    <ErrorState title="Não foi possível carregar a revisão" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : (
                    <>
                        <OptionTabs<View> id="adversarial-review-view" options={VIEWS} value={view} onChange={setView} className="w-full" />
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                                {view === "findings" ? (
                                    <ReviewFindingsBody review={review} />
                                ) : review.report ? (
                                    <Markdown className="text-sm">{review.report}</Markdown>
                                ) : (
                                    <p className="text-sm text-muted-foreground">Sem relatório (a rodada não terminou).</p>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
