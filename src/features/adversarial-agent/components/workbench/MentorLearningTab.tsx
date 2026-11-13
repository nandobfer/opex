"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useMentorRealtime, useWorkbenchMentorRuns } from "../../hooks/useMentor"
import type { MentorLearningRunDto } from "../../mentor/types"
import { formatDuration } from "../ReviewBadges"
import { MentorLearningRunBody } from "../mentor/MentorLearningRunBody"
import { MentorRunBadge } from "../mentor/MentorRunBadge"
import { MentorRunChip } from "../mentor/MentorRunSection"

/** Aba "Aprendizado (N)" da mesa (OPE-165): aparece quando a mesa tem ao menos uma execução do Mentor. */
export function useMentorLearningTab(workbenchId: string): { visible: boolean; count: number } {
    const query = useWorkbenchMentorRuns(workbenchId)
    useMentorRealtime(true)
    const count = query.data?.length ?? 0
    return { visible: count > 0, count }
}

const when = (value: string | null) => (value ? format(new Date(value), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—")

function RunCard({ run }: { run: MentorLearningRunDto }) {
    return (
        <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0 pb-3">
                <MentorRunBadge status={run.status} />
                <span className="text-sm font-medium">{`Conclusão de ${when(run.completedAt)}`}</span>
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                    {run.completionKind && <MentorRunChip>{run.completionKind === "manual" ? "Conclusão manual" : "Merge do PR"}</MentorRunChip>}
                    {(run.attempt ?? 1) > 1 && <MentorRunChip>{`Tentativa ${run.attempt}`}</MentorRunChip>}
                    <MentorRunChip label="Duração">{formatDuration(run.durationMs)}</MentorRunChip>
                </span>
            </CardHeader>
            <CardContent>
                <MentorLearningRunBody run={run} />
            </CardContent>
        </Card>
    )
}

/** Skeleton da aba: um card de execução (cabeçalho, duas seções de chips e dois casos). */
export function MentorLearningTabSkeleton() {
    return (
        <div className="space-y-4 p-4" aria-label="Carregando o aprendizado">
            <Card>
                <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-3">
                    <Skeleton className="h-5 w-28 rounded-full" />
                    <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent className="space-y-5">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                </CardContent>
            </Card>
        </div>
    )
}

/** Execuções do Agente Mentor nesta mesa, mais recentes primeiro (uma por conclusão e tentativa). */
export function MentorLearningTab({ workbenchId }: { workbenchId: string }) {
    const query = useWorkbenchMentorRuns(workbenchId)
    if (query.isLoading) return <MentorLearningTabSkeleton />
    if (query.isError) return <ErrorState title="Não foi possível carregar o aprendizado" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    const runs = query.data ?? []
    return (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <p className="text-xs text-muted-foreground">O Agente Mentor aprende uma vez por conclusão da mesa, lendo a transcrição inteira. Cada caso vai para uma lista (desenvolvedor global, desta central ou Adversário).</p>
            <AnimatePresence initial={false}>
                {runs.map((run) => (
                    <motion.div key={run.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                        <RunCard run={run} />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    )
}
