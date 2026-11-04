"use client"

import { AnimatePresence, motion } from "framer-motion"
import { TriangleAlert } from "lucide-react"
import { hasLowContrast } from "@/lib/colors"

/** Aviso de cor que some no fundo escuro do app (contraste abaixo de 3:1 com o card). */
export function LowContrastWarning({ color }: { color: string | null }) {
    const show = Boolean(color) && hasLowContrast(color!)
    return (
        <AnimatePresence initial={false}>
            {show && (
                <motion.p
                    key="low-contrast"
                    role="status"
                    data-testid="low-contrast-warning"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-1.5 overflow-hidden rounded-md bg-warning/15 px-2 py-1.5 text-xs text-warning ring-1 ring-warning/30"
                >
                    <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                    Pouco contraste com o tema escuro: textos e marcadores nesta cor podem ficar difíceis de ler.
                </motion.p>
            )}
        </AnimatePresence>
    )
}
