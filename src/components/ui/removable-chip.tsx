"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ChipItem {
    value: string
    label: ReactNode
    /** Texto para o `aria-label` do botão de remover (quando `label` não é texto). */
    text?: string
}

interface ChipListProps {
    items: readonly ChipItem[]
    onRemove: (value: string) => void
    disabled?: boolean
    className?: string
    "aria-label"?: string
}

/**
 * Chips dos valores escolhidos, cada um com "X" para remover (usado por `MultiAutocomplete` e
 * `ChipInput`). Entrada e saída animadas.
 */
export function ChipList({ items, onRemove, disabled, className, "aria-label": ariaLabel }: ChipListProps) {
    if (items.length === 0) return null
    return (
        <ul aria-label={ariaLabel} className={cn("flex flex-wrap gap-1.5", className)}>
            <AnimatePresence initial={false}>
                {items.map((item) => (
                    <motion.li
                        key={item.value}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={{ duration: 0.15 }}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/25 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary"
                    >
                        <span className="truncate">{item.label}</span>
                        {!disabled && (
                            <button
                                type="button"
                                onClick={() => onRemove(item.value)}
                                aria-label={`Remover ${item.text ?? (typeof item.label === "string" ? item.label : item.value)}`}
                                className="rounded-full p-0.5 transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <X className="h-3 w-3" aria-hidden />
                            </button>
                        )}
                    </motion.li>
                ))}
            </AnimatePresence>
        </ul>
    )
}
