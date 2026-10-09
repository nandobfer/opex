"use client"

import { Fragment, useState, type KeyboardEvent, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface AutocompleteOption {
    value: string
    label: string
    description?: string
    /** Cabeçalho de grupo (opções do mesmo grupo devem vir juntas). */
    group?: string
}

interface AutocompleteListProps {
    id: string
    open: boolean
    options: readonly AutocompleteOption[]
    activeIndex: number
    selected?: readonly string[]
    emptyText?: ReactNode
    footer?: ReactNode
    onPick: (option: AutocompleteOption) => void
    onHover: (index: number) => void
    /** Ação no cabeçalho de cada grupo (ex.: "Selecionar todas"). */
    groupAction?: (group: string) => ReactNode
}

export const optionId = (listId: string, index: number) => `${listId}-opt-${index}`

/** Lista suspensa (`listbox`) compartilhada pelos campos de autocomplete. O foco fica no input. */
export function AutocompleteList({ id, open, options, activeIndex, selected = [], emptyText, footer, onPick, onHover, groupAction }: AutocompleteListProps) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
                    // Mantém o foco no input ao clicar na lista.
                    onMouseDown={(event) => event.preventDefault()}
                >
                    <ul id={id} role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1">
                        {options.length === 0 && emptyText && <li className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyText}</li>}
                        {options.map((option, index) => {
                            const isSelected = selected.includes(option.value)
                            const newGroup = option.group && option.group !== options[index - 1]?.group
                            return (
                                <Fragment key={option.value}>
                                    {newGroup && (
                                        <li role="presentation" className="flex items-center justify-between gap-2 px-2 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
                                            <span>{option.group}</span>
                                            {groupAction?.(option.group!)}
                                        </li>
                                    )}
                                    <li
                                        id={optionId(id, index)}
                                        role="option"
                                        aria-selected={isSelected}
                                        onClick={() => onPick(option)}
                                        onMouseEnter={() => onHover(index)}
                                        className={cn("flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm", index === activeIndex && "bg-accent text-accent-foreground")}
                                    >
                                        <Check className={cn("h-4 w-4 shrink-0 text-primary", isSelected ? "opacity-100" : "opacity-0")} aria-hidden />
                                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                        {option.description && <span className="shrink-0 text-xs text-muted-foreground">{option.description}</span>}
                                    </li>
                                </Fragment>
                            )
                        })}
                    </ul>
                    {footer && <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">{footer}</div>}
                </motion.div>
            )}
        </AnimatePresence>
    )
}

/** Navegação por teclado da lista (↑/↓, Enter, Esc) com o índice ativo. */
export function useListNavigation(count: number) {
    const [activeIndex, setActiveIndex] = useState(-1)
    const [open, setOpen] = useState(false)

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, handlers: { onEnter: (index: number) => void; onBackspaceEmpty?: () => void }) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            setOpen(true)
            if (count === 0) return
            const step = event.key === "ArrowDown" ? 1 : -1
            setActiveIndex((current) => (current + step + count) % count)
        } else if (event.key === "Enter") {
            event.preventDefault()
            handlers.onEnter(open ? activeIndex : -1)
        } else if (event.key === "Escape") {
            setOpen(false)
            setActiveIndex(-1)
        } else if (event.key === "Backspace" && event.currentTarget.value === "") {
            handlers.onBackspaceEmpty?.()
        }
    }

    return { activeIndex, setActiveIndex, open, setOpen, onKeyDown }
}
