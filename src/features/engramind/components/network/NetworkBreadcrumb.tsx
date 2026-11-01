"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ChevronRight, Network } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Trilha "Rede › Canal X" / "Rede › Agente Y" com Voltar (o Esc também volta). No celular, só Voltar e o
 * nome atual (cortado no fim).
 */
export function NetworkBreadcrumb({ current, onBack }: { current: { kind: "channel" | "agent"; label: string } | null; onBack: () => void }) {
    return (
        <nav aria-label="Trilha da rede" className="flex min-h-8 min-w-0 items-center gap-2 text-sm">
            <AnimatePresence initial={false}>
                {current && (
                    <motion.span key="back" className="shrink-0" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.15 }}>
                        <Button type="button" size="sm" variant="outline" className="max-md:h-10" onClick={onBack}>
                            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Voltar
                        </Button>
                    </motion.span>
                )}
            </AnimatePresence>
            {current ? (
                <Button type="button" variant="ghost" size="sm" className="gap-1 px-2 text-muted-foreground max-md:hidden" onClick={onBack}>
                    <Network className="h-4 w-4" aria-hidden /> Rede
                </Button>
            ) : (
                <span className="flex items-center gap-1 font-medium text-foreground">
                    <Network className="h-4 w-4" aria-hidden /> Rede
                </span>
            )}
            {current && (
                <>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground max-md:hidden" aria-hidden />
                    <span className="min-w-0 truncate font-medium text-foreground" data-testid="breadcrumb-current">
                        {current.kind === "channel" ? "Canal" : "Agente"} {current.label}
                    </span>
                </>
            )}
        </nav>
    )
}
