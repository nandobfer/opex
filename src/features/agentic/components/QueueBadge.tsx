"use client"

import { motion } from "framer-motion"
import { ListOrdered } from "lucide-react"

/** Etiqueta "Na fila · #N" (central de desenvolvimento ou fila global do build). */
export function QueueBadge({ position, label = "Na fila", title = "Na fila da central" }: { position: number; label?: string; title?: string }) {
    return (
        <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            title={`${title} — posição ${position}`}
        >
            <ListOrdered className="h-3 w-3" aria-hidden /> {label} · #{position}
        </motion.span>
    )
}
