"use client"

import { useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { listItem } from "@/components/motion/presets"
import { workbenchPath } from "@/features/agentic/constants"
import { ADVERSARIAL_LEVEL_DEFS, FINDING_SEVERITIES } from "../constants"
import type { AdversarialReviewDto } from "../types"
import { DecisionBadge, formatCost, formatDuration } from "./ReviewBadges"
import { ReviewDetailDialog } from "./ReviewDetailDialog"
import { SeverityBadge } from "./FindingList"

/**
 * Rodadas do Agente Adversário (aba Revisões da configuração e página `/agente-adversario`): tarefa,
 * ciclo/rodada/criticidade, achados por severidade, decisão, custo, duração e "Ver" (detalhe).
 */
export function AdversarialReviewList({ items }: { items: readonly AdversarialReviewDto[] }) {
    const [open, setOpen] = useState<string | null>(null)
    return (
        <>
            <ul className="flex flex-col divide-y rounded-lg border" aria-label="Revisões do agente adversário">
                <AnimatePresence initial={false}>
                    {items.map((review) => (
                        <motion.li key={review.id} variants={listItem} initial="hidden" animate="visible" exit="exit" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                            <Link href={workbenchPath(review.taskId)} className="font-mono text-xs text-primary hover:underline">
                                {review.taskCode}
                            </Link>
                            <span className="min-w-0 flex-1 truncate" title={review.taskTitle}>
                                {review.taskTitle}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                Ciclo {review.cycle} · rodada {review.round} · {ADVERSARIAL_LEVEL_DEFS[review.level].label}
                            </span>
                            <span className="flex items-center gap-1">
                                {FINDING_SEVERITIES.filter((severity) => review.counts[severity] > 0).map((severity) => (
                                    <span key={severity} className="flex items-center gap-0.5 text-xs">
                                        <SeverityBadge severity={severity} />
                                        <span className="tabular-nums text-muted-foreground">{review.counts[severity]}</span>
                                    </span>
                                ))}
                            </span>
                            <DecisionBadge decision={review.decision} state={review.state} />
                            <span className="text-xs tabular-nums text-muted-foreground">
                                {formatCost(review.costUsd)} · {formatDuration(review.durationMs)} · {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true, locale: ptBR })}
                            </span>
                            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setOpen(review.id)} aria-label={`Ver a rodada ${review.round} de ${review.taskCode}`}>
                                <Eye className="h-3.5 w-3.5" aria-hidden /> Ver
                            </Button>
                        </motion.li>
                    ))}
                </AnimatePresence>
            </ul>
            <ReviewDetailDialog id={open} onClose={() => setOpen(null)} />
        </>
    )
}
