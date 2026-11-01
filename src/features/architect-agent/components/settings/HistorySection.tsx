"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Network } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { listItem } from "@/components/motion/presets"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { workbenchPath } from "@/features/agentic/constants"
import { formatCost, formatDuration } from "@/features/adversarial-agent/components/ReviewBadges"
import { ARCHITECT_DEPTH_DEFS, ARCHITECT_DIAGRAM_STATE_LABELS, ARCHITECT_HISTORY_LIMIT, ARCHITECT_ORIGIN_LABELS, type ArchitectDepth, type ArchitectDiagramState } from "../../constants"
import { useArchitectHistory, useArchitectRealtime } from "../../hooks/useArchitect"
import { diagramVersionLabel } from "../workbench/ArchitectToolbar"

const STATE_VARIANT: Record<ArchitectDiagramState, "default" | "secondary" | "destructive" | "outline"> = { running: "secondary", done: "default", failed: "destructive", interrupted: "destructive", superseded: "outline" }

/** Histórico: as versões geradas mais recentes por tarefa, com custo e duração. */
export function HistorySection() {
    const query = useArchitectHistory()
    useArchitectRealtime()
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Histórico</CardTitle>
                <CardDescription>As {ARCHITECT_HISTORY_LIMIT} versões mais recentes geradas pelo arquiteto nas mesas, com a origem, a profundidade, o custo e a duração.</CardDescription>
            </CardHeader>
            <CardContent>
                {query.isLoading ? (
                    <Skeleton className="h-48 w-full" />
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar o histórico" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : !query.data?.length ? (
                    <EmptyState icon={Network} title="Nenhum diagrama ainda" description="As versões aparecem aqui quando o arquiteto desenha o plano aprovado de uma mesa." />
                ) : (
                    <ul className="flex flex-col divide-y rounded-lg border" aria-label="Histórico do agente arquiteto">
                        <AnimatePresence initial={false}>
                            {query.data.map((item) => (
                                <motion.li key={item.id} variants={listItem} initial="hidden" animate="visible" exit="exit" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                                    <Link href={workbenchPath(item.taskId)} className="font-mono text-xs text-primary hover:underline">
                                        {item.taskCode}
                                    </Link>
                                    <span className="min-w-0 flex-1 truncate" title={item.taskTitle}>
                                        {item.taskTitle}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {diagramVersionLabel(item)} · {ARCHITECT_DEPTH_DEFS[item.depth as ArchitectDepth]?.label ?? `Nível ${item.depth}`} · {ARCHITECT_ORIGIN_LABELS[item.origin]}
                                    </span>
                                    <Badge variant={STATE_VARIANT[item.state]} title={item.error ?? undefined}>
                                        {ARCHITECT_DIAGRAM_STATE_LABELS[item.state]}
                                    </Badge>
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                        {formatCost(item.costUsd)} · {formatDuration(item.durationMs)} · {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}
                                    </span>
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
