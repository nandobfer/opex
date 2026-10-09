"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { PANE_WIDTHS } from "../../dev-center-layout"

interface CollapsiblePaneProps {
    /** Nome da coluna (região acessível). */
    label: string
    width: number
    collapsed: boolean
    /** Colunas lado a lado (`lg`+): só aí a largura é fixa/animada. */
    wide: boolean
    /** Conteúdo da faixa estreita (abaixo do botão de expandir). */
    rail: ReactNode
    className?: string
    children: ReactNode
}

/**
 * Coluna da Central de desenvolvimento que recolhe para uma faixa estreita, liberando espaço para a
 * mesa. O conteúdo aberto fica montado (escondido) ao recolher: rolagem e filtros se mantêm.
 */
export function CollapsiblePane({ label, width, collapsed, wide, rail, className, children }: CollapsiblePaneProps) {
    const reduceMotion = useReducedMotion()
    return (
        <motion.div
            initial={false}
            animate={wide ? { width: collapsed ? PANE_WIDTHS.rail : width } : undefined}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            className={cn("min-h-0 shrink-0", !wide && "w-full", className)}
            role="region"
            aria-label={label.charAt(0).toUpperCase() + label.slice(1)}
            data-collapsed={collapsed || undefined}
        >
            <Card className="flex h-full min-h-0 flex-col overflow-hidden">
                <AnimatePresence initial={false}>
                    {collapsed && (
                        <motion.div key="rail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex min-h-0 flex-1 flex-col items-center gap-2 py-2">
                            {rail}
                        </motion.div>
                    )}
                </AnimatePresence>
                <div className={cn("flex min-h-0 flex-1 flex-col", collapsed && "hidden")} aria-hidden={collapsed || undefined}>
                    {children}
                </div>
            </Card>
        </motion.div>
    )
}

/** Botão de recolher/expandir uma coluna (no cabeçalho aberto ou no topo da faixa). */
export function PaneToggle({ label, collapsed, onToggle }: { label: string; collapsed: boolean; onToggle: () => void }) {
    const text = collapsed ? `Expandir ${label}` : `Recolher ${label}`
    return (
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={onToggle} aria-expanded={!collapsed} aria-label={text} title={text}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
        </Button>
    )
}
