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
import { MENTOR_SOURCE_LABELS } from "../../mentor/constants"
import type { MentorRunDto } from "../../mentor/types"
import { formatCost } from "../ReviewBadges"
import { MentorRunBadge, formatScore } from "./MentorRunBadge"
import { MentorRunDialog } from "./MentorRunDialog"

/**
 * Execuções do Agente Mentor (aba Execuções da configuração e página `/agente-mentor`): tarefa,
 * origens, nota/limiar, situação, custo e "Ver" ou "Decidir" (sugestão aguardando aprovação).
 */
export function MentorRunList({ items }: { items: readonly MentorRunDto[] }) {
    const [openId, setOpenId] = useState<string | null>(null)
    const open = items.find((run) => run.id === openId) ?? null
    return (
        <>
            <ul className="flex flex-col divide-y rounded-lg border" aria-label="Execuções do Agente Mentor">
                <AnimatePresence initial={false}>
                    {items.map((run) => (
                        <motion.li key={run.id} variants={listItem} initial="hidden" animate="visible" exit="exit" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                            <Link href={workbenchPath(run.taskId)} className="font-mono text-xs text-primary hover:underline">
                                {run.taskCode}
                            </Link>
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={run.taskTitle}>
                                {run.sources.map((source) => MENTOR_SOURCE_LABELS[source]).join(" · ") || "—"}
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">{formatScore(run.score, run.threshold)}</span>
                            <MentorRunBadge status={run.status} />
                            <span className="text-xs tabular-nums text-muted-foreground">
                                {formatCost(run.costUsd)} · {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true, locale: ptBR })}
                            </span>
                            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setOpenId(run.id)} aria-label={`Ver a execução do Mentor em ${run.taskCode}`}>
                                <Eye className="h-3.5 w-3.5" aria-hidden /> {run.status === "suggested" ? "Decidir" : "Ver"}
                            </Button>
                        </motion.li>
                    ))}
                </AnimatePresence>
            </ul>
            <MentorRunDialog run={open} onClose={() => setOpenId(null)} />
        </>
    )
}
