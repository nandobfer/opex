"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Info } from "lucide-react"

/** Motivo de uma feature indisponível (ex.: "Ative o Agente Revisor"), com entrada e saída animadas. */
export function AvailabilityNotice({ reason }: { reason: string | null | undefined }) {
    return (
        <AnimatePresence initial={false}>
            {reason && (
                <motion.p key="availability" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {reason}
                </motion.p>
            )}
        </AnimatePresence>
    )
}
