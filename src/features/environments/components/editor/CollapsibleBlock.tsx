"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/** Bloco recolhível de uma seção (YAML avançado, prévia do deploy), com abrir e fechar animados. */
export function CollapsibleBlock({ id, title, description, open, onOpenChange, children }: { id: string; title: string; description?: string; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
    return (
        <div id={id} className="scroll-mt-6 rounded-lg border">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={`${id}-body`}
                className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onOpenChange(!open)}
            >
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{title}</span>
                    {description && <span className="block text-xs text-muted-foreground">{description}</span>}
                </span>
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div id={`${id}-body`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="border-t px-4 py-3">{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
