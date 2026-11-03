"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ChevronRight, Network } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface BreadcrumbApp {
    label: string
    /** Abre o app (quando há um universo aberto por cima dele). */
    onOpen: () => void
}

/**
 * Trilha "Rede › App X › Agente Y" / "Rede › Canal X" com Voltar (o Esc também volta, um nível por
 * vez, OPE-129). No celular, só Voltar e o nome atual (cortado no fim). `actions` (Importar e Novo
 * canal) ficam à direita, na mesma linha.
 */
export function NetworkBreadcrumb({ app = null, current, onBack, onHome, actions }: { app?: BreadcrumbApp | null; current: { kind: "channel" | "agent"; label: string } | null; onBack: () => void; onHome?: () => void; actions?: React.ReactNode }) {
    const nested = current !== null || app !== null
    return (
        <nav aria-label="Trilha da rede" className="flex min-h-8 min-w-0 items-center gap-2 text-sm" data-testid="network-breadcrumb">
            <AnimatePresence initial={false}>
                {nested && (
                    <motion.span key="back" className="shrink-0" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.15 }}>
                        <Button type="button" size="sm" variant="outline" className="max-md:h-10" onClick={onBack}>
                            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Voltar
                        </Button>
                    </motion.span>
                )}
            </AnimatePresence>
            {nested ? (
                <Button type="button" variant="ghost" size="sm" className="gap-1 px-2 text-muted-foreground max-md:hidden" onClick={onHome ?? onBack}>
                    <Network className="h-4 w-4" aria-hidden /> Rede
                </Button>
            ) : (
                <span className="flex items-center gap-1 font-medium text-foreground">
                    <Network className="h-4 w-4" aria-hidden /> Rede
                </span>
            )}
            {app && (
                <motion.span key="app" className={current ? "flex min-w-0 items-center gap-2 max-md:hidden" : "flex min-w-0 items-center gap-2"} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.15 }}>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground max-md:hidden" aria-hidden />
                    {current ? (
                        <Button type="button" variant="ghost" size="sm" className="px-2 text-muted-foreground max-md:hidden" data-testid="breadcrumb-app" onClick={app.onOpen}>
                            App {app.label}
                        </Button>
                    ) : (
                        <span className="min-w-0 truncate font-medium text-foreground" data-testid="breadcrumb-current">
                            App {app.label}
                        </span>
                    )}
                </motion.span>
            )}
            {current && (
                <>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground max-md:hidden" aria-hidden />
                    <span className="min-w-0 truncate font-medium text-foreground" data-testid="breadcrumb-current">
                        {current.kind === "channel" ? "Canal" : "Agente"} {current.label}
                    </span>
                </>
            )}
            {actions}
        </nav>
    )
}
