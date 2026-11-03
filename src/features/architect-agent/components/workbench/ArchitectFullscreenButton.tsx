"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CANVAS_TOOL_BUTTON_CLASS } from "./ArchitectCanvasToolbar"

/** "Tela cheia" / "Sair da tela cheia" no fim da barra do canvas (o ícone troca animado). */
export function ArchitectFullscreenButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
    const reducedMotion = useReducedMotion()
    const Icon = active ? Minimize2 : Maximize2
    return (
        <Button type="button" variant="outline" size="sm" className={CANVAS_TOOL_BUTTON_CLASS} aria-pressed={active} onClick={onToggle} data-testid="architect-fullscreen">
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={active ? "exit" : "enter"}
                    className="inline-flex"
                    initial={reducedMotion ? false : { opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.15 }}
                >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                </motion.span>
            </AnimatePresence>
            {active ? "Sair da tela cheia" : "Tela cheia"}
        </Button>
    )
}
