"use client"

import { motion, useReducedMotion } from "framer-motion"
import { formatBadge } from "../../navigation"

interface SidebarBadgeProps {
    count: number
    /** Texto para leitor de tela, com a quantidade ("3 conversas não lidas"). */
    label: string
    collapsed: boolean
}

/**
 * Contador do item (padrão Badge do DS Sipal): número em pt-BR com limite "99+" e texto próprio
 * para leitor de tela. Recolhido, vira um ponto de aviso — que também é anunciado.
 */
export function SidebarBadge({ count, label, collapsed }: SidebarBadgeProps) {
    const reduceMotion = useReducedMotion()
    if (count <= 0) return null

    if (collapsed) {
        return (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-primary/25" data-testid="sidebar-badge-dot">
                <span className="sr-only">{label}</span>
            </span>
        )
    }

    return (
        <motion.span
            key={count}
            initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground tabular-nums"
        >
            <span aria-hidden>{formatBadge(count)}</span>
            <span className="sr-only">{label}</span>
        </motion.span>
    )
}
