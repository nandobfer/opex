"use client"

import type { LucideIcon } from "lucide-react"
import { motion } from "framer-motion"

const block = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.2 } }

/** Bloco animado da coluna lateral da Simulação (título com ícone + conteúdo). */
export function SimulationBlock({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
    return (
        <motion.section {...block} className="space-y-1.5 rounded-md border bg-card p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5" aria-hidden /> {title}
            </h4>
            {children}
        </motion.section>
    )
}
