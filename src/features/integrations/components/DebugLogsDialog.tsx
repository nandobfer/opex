"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { dialogPanelMotion } from "@/components/motion/dialog-panel-motion"
import { isSearchEscape } from "./DebugSearchBar"

/**
 * Modal de logs de debug (integrações e plugins). O X absoluto do `DialogContent` do core (sempre o
 * último filho) é ocultado; o Fechar próprio entra na barra do terminal via `DialogClose`. Esc: com
 * texto na busca, limpa a busca; senão, fecha.
 */
export function DebugLogsDialog({ openKey, onOpenChange, children }: { openKey: string | null; onOpenChange: (open: boolean) => void; children: ReactNode }) {
    return (
        <Dialog open={openKey !== null} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-5xl overflow-hidden p-0 [&>button:last-child]:hidden"
                onEscapeKeyDown={(event) => {
                    // Esse Esc é da busca (limpar o campo), não do modal.
                    if (isSearchEscape(event)) event.preventDefault()
                }}
            >
                <AnimatePresence mode="wait">
                    {openKey && (
                        <motion.div key={openKey} {...dialogPanelMotion} className="p-6">
                            {children}
                        </motion.div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    )
}
