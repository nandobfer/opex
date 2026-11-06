"use client"

import { motion, useReducedMotion } from "framer-motion"
import { RefreshCw } from "lucide-react"

interface RefreshIconButtonProps {
    onClick: () => void
    /** Leitura em andamento: o ícone gira (parado com movimento reduzido). */
    busy: boolean
    disabled?: boolean
    ariaLabel: string
}

/** Botão "Atualizar" dos painéis de consumo (quota do OpenCode e recursos do servidor). */
export function RefreshIconButton({ onClick, busy, disabled, ariaLabel }: RefreshIconButtonProps) {
    const reduceMotion = useReducedMotion()
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
            title="Atualizar"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
        >
            <motion.span animate={busy && !reduceMotion ? { rotate: 360 } : { rotate: 0 }} transition={busy ? { duration: 0.8, repeat: Infinity, ease: "linear" } : { duration: 0 }} className="flex">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            </motion.span>
        </button>
    )
}
