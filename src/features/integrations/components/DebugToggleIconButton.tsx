"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Bug } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Botão de debug do título (integrações e plugins): abre/fecha a coluna de logs. */
export function DebugToggleIconButton({ visible = true, open, onToggle, panelId, className = "ml-auto shrink-0" }: { visible?: boolean; open: boolean; onToggle: () => void; panelId: string; className?: string }) {
    const label = open ? "Fechar logs de debug" : "Abrir logs de debug"
    return (
        <AnimatePresence initial={false}>
            {visible && (
                <motion.div key="debug-toggle" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }} className={className}>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" onClick={onToggle} aria-label={label} aria-expanded={open} aria-controls={panelId} className={cn(open && "bg-accent text-primary")}>
                                    <Bug className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{label}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
