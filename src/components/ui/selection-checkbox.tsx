"use client"

import type { MouseEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface SelectionCheckboxProps {
    /** `"mixed"` = parte dos itens selecionada (cabeçalhos "selecionar todos"). */
    checked: boolean | "mixed"
    /** Recebe o evento (ex.: `shiftKey` para selecionar intervalo). */
    onToggle: (event: MouseEvent<HTMLButtonElement>) => void
    label: string
    disabled?: boolean
    className?: string
}

/**
 * Checkbox de seleção de linhas/cards, com estado "parcial" e o evento de clique (Shift). Não
 * propaga clique, toque nem teclado: dentro de linha/card clicável ou arrastável não abre nem
 * arrasta o item.
 */
export function SelectionCheckbox({ checked, onToggle, label, disabled, className }: SelectionCheckboxProps) {
    const on = checked !== false
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked === "mixed" ? "mixed" : checked}
            aria-label={label}
            disabled={disabled}
            onClick={(event) => {
                event.stopPropagation()
                onToggle(event)
            }}
            onMouseDown={(event) => {
                // Shift+clique não seleciona o texto da página.
                if (event.shiftKey) event.preventDefault()
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            className={cn(
                "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
                on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/60 bg-background hover:border-primary",
                className,
            )}
        >
            <AnimatePresence initial={false} mode="wait">
                {on && (
                    <motion.span key={checked === "mixed" ? "mixed" : "on"} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.12 }} className="inline-flex">
                        {checked === "mixed" ? <Minus className="h-3 w-3" strokeWidth={3} aria-hidden /> : <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
                    </motion.span>
                )}
            </AnimatePresence>
        </button>
    )
}
