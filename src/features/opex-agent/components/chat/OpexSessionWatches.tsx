"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Eye, X } from "lucide-react"
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
import { useNow } from "@/hooks/useNow"
import { activeWatches, useCancelOpexWatch, useOpexSessionWatches, useOpexWatchesRealtime } from "../../hooks/useOpexWatches"
import { formatWatchRemaining, type OpexWatchDto } from "../../watches"

const pill = { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.95 }, transition: { duration: 0.18 } }

/**
 * Faixa "Observando…" acima do campo do chat (OPE-194): as observações de evento ativas da sessão, com o
 * prazo e o X para cancelar (com confirmação). O agente hibernado acorda sozinho quando o evento acontece.
 */
export function OpexSessionWatches({ sessionId }: { sessionId: string }) {
    const query = useOpexSessionWatches(sessionId)
    const cancel = useCancelOpexWatch()
    const [canceling, setCanceling] = useState<OpexWatchDto | null>(null)
    useOpexWatchesRealtime(true)
    const now = useNow(60_000)
    const watches = activeWatches(query.data)

    return (
        <>
            <AnimatePresence initial={false}>
                {watches.length > 0 && (
                    <motion.div key="watches" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden border-t bg-muted/20">
                        <ul className="flex flex-wrap gap-1.5 px-3 py-2" aria-label="Observações de evento ativas" data-testid="opex-session-watches">
                            <AnimatePresence initial={false}>
                                {watches.map((watch) => (
                                    <motion.li key={watch.id} {...pill} className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/40 py-0.5 pl-2.5 pr-1 text-[11px] text-muted-foreground" data-testid="opex-watch-pill" title={watch.note}>
                                        <Eye className="h-3 w-3 shrink-0 text-primary" aria-hidden />
                                        <span className="truncate">{watch.pillText}</span>
                                        <span className="shrink-0 text-muted-foreground/70">· {watch.status === "watching" ? `expira em ${formatWatchRemaining(watch.expiresAt, new Date(now))}` : "acordando o agente…"}</span>
                                        {watch.status === "watching" && (
                                            <button
                                                type="button"
                                                className="rounded-full p-0.5 hover:bg-muted hover:text-foreground"
                                                onClick={() => setCanceling(watch)}
                                                aria-label={`Cancelar: ${watch.pillText}`}
                                            >
                                                <X className="h-3 w-3" aria-hidden />
                                            </button>
                                        )}
                                    </motion.li>
                                ))}
                            </AnimatePresence>
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
            <AlertDialog open={Boolean(canceling)} onOpenChange={(open) => !open && setCanceling(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar a observação?</AlertDialogTitle>
                        <AlertDialogDescription>{canceling?.pillText}. O agente não será acordado por este evento.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (canceling) cancel.mutate(canceling.id)
                                setCanceling(null)
                            }}
                        >
                            Cancelar observação
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
