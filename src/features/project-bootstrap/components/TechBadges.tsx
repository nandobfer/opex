"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Cpu } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DetectedTechGroup } from "../tech-detect"
import { techChipProps, techDividerStyle, techDotStyle } from "../tech-colors"

interface TechBadgesProps {
    groups: readonly DetectedTechGroup[]
    /** Texto quando nenhuma tecnologia foi reconhecida (o envio continua permitido). */
    emptyText?: string
    className?: string
}

/**
 * Tecnologias reconhecidas no contexto, agrupadas: nome do grupo com a cor dele, divisor e os badges
 * (somente leitura), entrando e saindo com animação enquanto o dono digita.
 */
export function TechBadges({ groups, emptyText = "As tecnologias citadas no contexto aparecem aqui.", className }: TechBadgesProps) {
    return (
        <div className={cn("space-y-3", className)} aria-live="polite" aria-label="Tecnologias reconhecidas">
            <AnimatePresence initial={false} mode="popLayout">
                {groups.length === 0 ? (
                    <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Cpu className="h-3.5 w-3.5" aria-hidden /> {emptyText}
                    </motion.p>
                ) : (
                    groups.map((entry) => {
                        const chip = techChipProps(entry.group.color)
                        return (
                            <motion.section key={entry.group.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="space-y-1.5" data-tech-group={entry.group.name}>
                                <div className="flex items-center gap-2">
                                    <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" style={techDotStyle(entry.group.color)} aria-hidden />
                                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{entry.group.name}</span>
                                    <span className="h-px flex-1 bg-border" style={techDividerStyle(entry.group.color)} aria-hidden />
                                </div>
                                <ul className="flex flex-wrap gap-1.5">
                                    <AnimatePresence initial={false}>
                                        {entry.technologies.map((tech) => (
                                            <motion.li
                                                key={tech.id}
                                                layout="position"
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.8 }}
                                                transition={{ type: "spring", stiffness: 420, damping: 26 }}
                                                className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium shadow-sm", chip.className)}
                                                style={chip.style}
                                            >
                                                {tech.name}
                                            </motion.li>
                                        ))}
                                    </AnimatePresence>
                                </ul>
                            </motion.section>
                        )
                    })
                )}
            </AnimatePresence>
        </div>
    )
}
