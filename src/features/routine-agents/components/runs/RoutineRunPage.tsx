"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { Ban, SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AgentPageHeader } from "@/components/list/AgentPageHeader"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { agentDef } from "@/features/agent-metrics/catalog"
import { routineRunPath, routineRunsHref } from "../../constants"
import { useCancelRoutineRun, useResolveRoutineAction, useRoutineRun } from "../../hooks/useRoutineRuns"
import { useRoutineRealtime } from "../../hooks/useRoutineRealtime"
import { ROUTINE_TRIGGER_ORIGIN_LABELS, canCancelRun } from "../../status"
import type { RoutineRunDetailDto } from "../../types"
import { RoutineRunStatusBadge } from "../RoutineBadges"
import { RoutineRunAside, RoutineRunMain } from "./RoutineRunDetail"
import { RoutineRunPageSkeleton } from "./RoutineRunPageSkeleton"
import { RUN_PAGE_CLASS, RUN_PAGE_GRID } from "./run-page-layout"

/** Linha abaixo do título: agente, origem, motor e modelo. */
export function routineRunDescription(run: RoutineRunDetailDto): string {
    return [run.agentName, ROUTINE_TRIGGER_ORIGIN_LABELS[run.origin], run.engine === "opex" ? "motor Opex" : "OpenCode no host", run.model].filter(Boolean).join(" · ")
}

/**
 * Página de uma execução de agente rotineiro (`/agentes-rotineiros/[id]/execucoes/[runId]`, OPE-208, no lugar da
 * gaveta): cabeçalho com o voltar para as Execuções, o status e Cancelar; o conteúdo (ação pendente, relato e
 * passos) à esquerda e o resumo (tempos, tokens, custos e ferramentas) à direita. Atualiza em tempo real.
 * Execução de outro agente: troca o endereço para o do agente dela.
 */
export function RoutineRunPage({ agentId, runId }: { agentId: string; runId: string }) {
    useRoutineRealtime()
    const def = agentDef("rotineiros")
    const router = useRouter()
    const reduceMotion = useReducedMotion()
    const query = useRoutineRun(runId)
    const cancel = useCancelRoutineRun(agentId)
    const resolve = useResolveRoutineAction(agentId)
    const [confirmCancel, setConfirmCancel] = useState(false)
    const run = query.data
    const misplaced = run !== undefined && run.agentId !== agentId
    useEffect(() => {
        if (run && misplaced) router.replace(routineRunPath(run.agentId, run.id))
    }, [misplaced, router, run])
    const back = routineRunsHref(agentId)

    if (query.isLoading || misplaced) return <RoutineRunPageSkeleton />
    if (query.isError || !run) {
        if (apiErrorCode(query.error) === "ROUTINE_RUN_NOT_FOUND")
            return <EmptyState icon={SearchX} title="Execução não encontrada" description="Ela pode ter sido apagada pela retenção das execuções." actionLabel="Ver as execuções do agente" onAction={() => router.push(back)} />
        return <ErrorState title="Não foi possível carregar a execução" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    }
    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={RUN_PAGE_CLASS} aria-label={`Execução #${run.seq}`}>
            <AgentPageHeader icon={def.icon} title={`Execução #${run.seq}`} description={routineRunDescription(run)} backHref={back} backLabel="Voltar para as execuções">
                <RoutineRunStatusBadge status={run.status} />
                {canCancelRun(run.status) && (
                    <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setConfirmCancel(true)}>
                        <Ban className="h-4 w-4" aria-hidden /> Cancelar execução
                    </Button>
                )}
            </AgentPageHeader>
            <div className={RUN_PAGE_GRID}>
                <RoutineRunMain run={run} resolvePending={resolve.isPending} onResolve={(decision) => resolve.mutate({ runId: run.id, decision })} />
                <RoutineRunAside run={run} />
            </div>
            <ConfirmDialog
                open={confirmCancel}
                onOpenChange={setConfirmCancel}
                title="Cancelar esta execução?"
                description="O turno é interrompido (ou a espera encerrada) e a execução termina como Cancelada."
                confirmLabel="Cancelar execução"
                variant="destructive"
                pending={cancel.isPending}
                onConfirm={() => cancel.mutate(run.id, { onSettled: () => setConfirmCancel(false) })}
            />
        </motion.section>
    )
}
