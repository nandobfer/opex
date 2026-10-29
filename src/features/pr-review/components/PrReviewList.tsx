"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { usePrReviewAction } from "../hooks/usePrReview"
import type { PrReviewDto } from "../types"
import { PrReviewRow } from "./PrReviewRow"
import { PrReviewDetailDialog } from "./PrReviewDetailDialog"

/** Revisões da página Agente Revisor: "Ver" (saída ao vivo + relatório), "Revisar de novo" e "Parar" (com confirmação). */
export function PrReviewList({ items, available }: { items: readonly PrReviewDto[]; available: boolean }) {
    const action = usePrReviewAction()
    const [openId, setOpenId] = useState<string | null>(null)
    const [stopId, setStopId] = useState<string | null>(null)

    return (
        <>
            <ul className="space-y-2" aria-label="Revisões do Agente Revisor">
                <AnimatePresence initial={false}>
                    {items.map((review) => (
                        <motion.li key={review.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                            <PrReviewRow
                                review={review}
                                available={available}
                                busy={action.isPending}
                                onOpen={() => setOpenId(review.id)}
                                onRerun={() => action.mutate({ id: review.id, action: "rerun" })}
                                onStop={() => setStopId(review.id)}
                            />
                        </motion.li>
                    ))}
                </AnimatePresence>
            </ul>

            <PrReviewDetailDialog id={openId} onClose={() => setOpenId(null)} />
            <AlertDialog open={stopId !== null} onOpenChange={(open) => !open && setStopId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Parar a revisão?</AlertDialogTitle>
                        <AlertDialogDescription>Revisão na fila sai da fila; em andamento, o agente é interrompido (o que já foi publicado no GitHub permanece).</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (stopId) action.mutate({ id: stopId, action: "stop" })
                                setStopId(null)
                            }}
                        >
                            Parar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
