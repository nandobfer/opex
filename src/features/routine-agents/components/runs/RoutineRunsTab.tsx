"use client"

import { History } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { VirtualStack } from "@/components/list/VirtualStack"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { APP_SCROLL_CONTAINER_ID } from "@/hooks/usePageVirtualizer"
import { apiErrorMessage } from "@/lib/api"
import { useRoutineRuns } from "../../hooks/useRoutineRuns"
import { ROUTINE_RUN_ROW_HEIGHT, RoutineRunRow } from "./RoutineRunRow"

const scrollRef = { get current() { return typeof document === "undefined" ? null : document.getElementById(APP_SCROLL_CONTAINER_ID) } }

/** Aba **Execuções**: lista ao vivo (tempo real), a mais recente primeiro; o detalhe abre ao clicar. */
export function RoutineRunsTab({ agentId, onOpen }: { agentId: string; onOpen: (runId: string) => void }) {
    const query = useRoutineRuns(agentId)
    const runs = query.data ?? []
    if (query.isLoading)
        return (
            <div className="space-y-2" data-testid="routine-runs-skeleton">
                {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} className="h-16 w-full rounded-lg" />
                ))}
            </div>
        )
    if (query.isError) return <ErrorState title="Não foi possível carregar as execuções" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    if (!runs.length) return <EmptyState icon={History} title="Nenhuma execução" description="Use &quot;Executar agora&quot; ou configure um gatilho para o agente executar sozinho." />
    return (
        <VirtualStack
            className="space-y-2"
            count={runs.length}
            scrollRef={scrollRef}
            estimateSize={ROUTINE_RUN_ROW_HEIGHT + 8}
            getKey={(index) => runs[index]!.id}
            renderItem={(index) => <RoutineRunRow run={runs[index]!} onOpen={() => onOpen(runs[index]!.id)} />}
        />
    )
}
