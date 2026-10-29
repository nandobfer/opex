"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ActiveFilterChips, type ActiveFilterChip } from "./ActiveFilterChips"

/**
 * Peças compartilhadas das áreas de filtros recolhíveis (`ListFilters` de /tarefas e a coluna
 * Tarefas da Central de desenvolvimento): o chevron que alterna, o resumo em chips enquanto
 * recolhida e o conteúdo que abre/fecha com a altura animada (Framer Motion, movimento reduzido só
 * com opacidade).
 */

interface CollapseToggleProps {
    collapsed: boolean
    onToggle: () => void
    /** Id do conteúdo controlado (`aria-controls`). */
    controls: string
}

/** Botão ⌄/⌃ que expande/recolhe os filtros (não propaga o clique ao cabeçalho). */
export function CollapseToggle({ collapsed, onToggle, controls }: CollapseToggleProps) {
    const label = collapsed ? "Expandir filtros" : "Recolher filtros"
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={(event) => {
                event.stopPropagation()
                onToggle()
            }}
            aria-expanded={!collapsed}
            aria-controls={controls}
            aria-label={label}
            title={label}
        >
            {collapsed ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}
        </Button>
    )
}

interface CollapsedChipsProps {
    collapsed: boolean
    chips: readonly ActiveFilterChip[]
    maxVisible?: number
    className?: string
}

/** Resumo dos filtros ativos, visível só com a área recolhida (entra/sai com fade). */
export function CollapsedChips({ collapsed, chips, maxVisible, className }: CollapsedChipsProps) {
    return (
        <AnimatePresence initial={false}>
            {collapsed && (
                <motion.div key="chips" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                    <ActiveFilterChips chips={chips} maxVisible={maxVisible} className={className} />
                </motion.div>
            )}
        </AnimatePresence>
    )
}

interface CollapsibleBodyProps {
    collapsed: boolean
    id: string
    className?: string
    children: ReactNode
}

/** Conteúdo dos filtros: abre/fecha com a altura animada. Popovers abrem em portal (o overflow não os corta). */
export function CollapsibleBody({ collapsed, id, className, children }: CollapsibleBodyProps) {
    const reduceMotion = useReducedMotion()
    return (
        <AnimatePresence initial={false}>
            {!collapsed && (
                <motion.div
                    key="content"
                    id={id}
                    initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    animate={reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className={cn("overflow-hidden", className)}
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    )
}
