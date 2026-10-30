"use client"

import { useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Eye, GraduationCap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { listItem } from "@/components/motion/presets"
import { apiErrorMessage } from "@/lib/api"
import { workbenchPath } from "@/features/agentic/constants"
import { MENTOR_HISTORY_LIMIT, MENTOR_SOURCE_LABELS } from "../../mentor/constants"
import { useMentorRealtime, useMentorRuns } from "../../hooks/useMentor"
import { formatCost } from "../ReviewBadges"
import { MentorRunBadge, MentorTargetBadge, formatScore } from "./MentorRunBadge"
import { MentorRunDialog } from "./MentorRunDialog"

/** Execuções do Mentor (as mais recentes): calibrar o rigor e decidir as sugestões. */
export function MentorRunsSection() {
    const query = useMentorRuns()
    useMentorRealtime()
    const [openId, setOpenId] = useState<string | null>(null)
    const open = query.data?.find((run) => run.id === openId) ?? null
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Execuções</CardTitle>
                <CardDescription>As {MENTOR_HISTORY_LIMIT} avaliações mais recentes do Mentor, com a nota do decisor, a decisão do redator e a memória gravada. No modo Sugerir, abra a execução para aprovar ou descartar.</CardDescription>
            </CardHeader>
            <CardContent>
                {query.isLoading ? (
                    <Skeleton className="h-48 w-full" />
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar as execuções" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : !query.data?.length ? (
                    <EmptyState icon={GraduationCap} title="Nenhuma execução ainda" description="As avaliações aparecem aqui quando um turno da mesa dispara o Mentor (ex.: uma correção pedida por você)." />
                ) : (
                    <ul className="flex flex-col divide-y rounded-lg border" aria-label="Execuções do Agente Mentor">
                        <AnimatePresence initial={false}>
                            {query.data.map((run) => (
                                <motion.li key={run.id} variants={listItem} initial="hidden" animate="visible" exit="exit" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                                    <Link href={workbenchPath(run.taskId)} className="font-mono text-xs text-primary hover:underline">
                                        {run.taskCode}
                                    </Link>
                                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={run.taskTitle}>
                                        {run.sources.map((source) => MENTOR_SOURCE_LABELS[source]).join(" · ") || "—"}
                                    </span>
                                    <span className="text-xs tabular-nums text-muted-foreground">{formatScore(run.score, run.threshold)}</span>
                                    <MentorRunBadge status={run.status} />
                                    {run.target && <MentorTargetBadge target={run.target} />}
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
                )}
            </CardContent>
            <MentorRunDialog run={open} onClose={() => setOpenId(null)} />
        </Card>
    )
}
