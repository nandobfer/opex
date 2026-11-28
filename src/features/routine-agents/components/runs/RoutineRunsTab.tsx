"use client"

import { useState } from "react"
import { History } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { VirtualStack } from "@/components/list/VirtualStack"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { APP_SCROLL_CONTAINER_ID } from "@/hooks/usePageVirtualizer"
import { apiErrorMessage } from "@/lib/api"
import { useCancelRoutineRun, useRoutineRuns } from "../../hooks/useRoutineRuns"
import type { RoutineRunDto } from "../../types"
import { RoutineRunCard } from "./RoutineRunCard"
import { ROUTINE_RUN_CARD_CLASS, ROUTINE_RUN_CARD_ESTIMATE, ROUTINE_RUN_CARD_GAP } from "./run-card"

const scrollRef = { get current() { return typeof document === "undefined" ? null : document.getElementById(APP_SCROLL_CONTAINER_ID) } }

/** Skeleton no formato do card (cabeçalho, tempos, relato e consumo). */
function RoutineRunsSkeleton() {
    return (
        <div className={ROUTINE_RUN_CARD_GAP} data-testid="routine-runs-skeleton">
            {[0, 1, 2, 3].map((index) => (
                <div key={index} className={`${ROUTINE_RUN_CARD_CLASS} space-y-3`}>
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-24 rounded-full" />
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="ml-auto h-4 w-32" />
                    </div>
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-2/5" />
                </div>
            ))}
        </div>
    )
}

/** Aba **Execuções**: um card por execução (OPE-213), ao vivo (tempo real), a mais recente primeiro. */
export function RoutineRunsTab({ agentId }: { agentId: string }) {
    const query = useRoutineRuns(agentId)
    const cancel = useCancelRoutineRun(agentId)
    const [canceling, setCanceling] = useState<RoutineRunDto | null>(null)
    const runs = query.data ?? []
    if (query.isLoading) return <RoutineRunsSkeleton />
    if (query.isError) return <ErrorState title="Não foi possível carregar as execuções" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    if (!runs.length) return <EmptyState icon={History} title="Nenhuma execução" description="Use &quot;Executar agora&quot; ou configure um gatilho para o agente executar sozinho." />
    return (
        <>
            <VirtualStack
                className={ROUTINE_RUN_CARD_GAP}
                count={runs.length}
                scrollRef={scrollRef}
                estimateSize={ROUTINE_RUN_CARD_ESTIMATE + 12}
                getKey={(index) => runs[index]!.id}
                renderItem={(index) => <RoutineRunCard run={runs[index]!} onCancel={setCanceling} />}
            />
            <ConfirmDialog
                open={canceling !== null}
                onOpenChange={(open) => !open && setCanceling(null)}
                title="Cancelar esta execução?"
                description="O turno é interrompido (ou a espera encerrada) e a execução termina como Cancelada."
                confirmLabel="Cancelar execução"
                variant="destructive"
                pending={cancel.isPending}
                onConfirm={() => canceling && cancel.mutate(canceling.id, { onSettled: () => setCanceling(null) })}
            />
        </>
    )
}
