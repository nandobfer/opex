"use client"

import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Um filtro ativo no resumo do `ListFilters` recolhido. */
export interface ActiveFilterChip {
    key: string
    label: string
    /** Texto completo (ex.: todos os valores quando o rótulo resume "3 selecionados"). */
    title?: string
    /** Remove só este filtro (mostra o ×). */
    onRemove?: () => void
    /** Chip discreto (preferência, não filtro — ex.: ordenação). */
    subtle?: boolean
}

interface ActiveFilterChipsProps {
    chips: readonly ActiveFilterChip[]
    /** Chips visíveis antes do "+N". */
    maxVisible?: number
    emptyLabel?: string
    className?: string
}

function Chip({ chip }: { chip: ActiveFilterChip }) {
    return (
        <motion.span
            layout="position"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.15 }}
            title={chip.title ?? chip.label}
            className={cn(
                "inline-flex min-w-0 max-w-[260px] items-center gap-1 rounded-full border py-0.5 pl-2.5 text-xs",
                chip.onRemove ? "pr-1" : "pr-2.5",
                chip.subtle ? "border-border bg-muted/50 text-muted-foreground" : "border-primary/30 bg-primary/10 text-foreground",
            )}
            data-testid={`filter-chip-${chip.key}`}
        >
            <span className="truncate">{chip.label}</span>
            {chip.onRemove && (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation()
                        chip.onRemove?.()
                    }}
                    className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Remover filtro ${chip.label}`}
                >
                    <X className="h-3 w-3" aria-hidden />
                </button>
            )}
        </motion.span>
    )
}

/** Resumo dos filtros ativos (chips removíveis, "+N" com o restante na dica). */
export function ActiveFilterChips({ chips, maxVisible = 4, emptyLabel = "Nenhum filtro ativo · clique para filtrar", className }: ActiveFilterChipsProps) {
    const visible = chips.slice(0, maxVisible)
    const hidden = chips.slice(maxVisible)

    return (
        <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
            <AnimatePresence initial={false} mode="popLayout">
                {chips.length === 0 ? (
                    <motion.span key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs italic text-muted-foreground">
                        {emptyLabel}
                    </motion.span>
                ) : (
                    visible.map((chip) => <Chip key={chip.key} chip={chip} />)
                )}
            </AnimatePresence>
            {hidden.length > 0 && (
                <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                        <span className="inline-flex shrink-0 cursor-default items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground" onClick={(event) => event.stopPropagation()}>
                            +{hidden.length}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs p-2">
                        <ul className="space-y-1 text-xs">
                            {hidden.map((chip) => (
                                <li key={chip.key}>{chip.title ?? chip.label}</li>
                            ))}
                        </ul>
                    </TooltipContent>
                </Tooltip>
            )}
        </div>
    )
}
