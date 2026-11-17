"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Bug } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useIntegrationDebugToggle } from "./debug-toggle-context"

/** Botão do título que abre/fecha os logs do modo debug (só com o modo debug salvo). */
export function DebugToggleButton() {
    const debug = useIntegrationDebugToggle()
    const visible = !!debug?.available
    const label = debug?.open ? "Fechar logs de debug" : "Abrir logs de debug"
    return (
        <AnimatePresence initial={false}>
            {visible && debug && (
                <motion.div
                    key="debug-toggle"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    className="ml-auto shrink-0"
                >
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={debug.toggle}
                                    aria-label={label}
                                    aria-expanded={debug.open}
                                    aria-controls={debug.panelId}
                                    className={cn(debug.open && "bg-accent text-primary")}
                                >
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
