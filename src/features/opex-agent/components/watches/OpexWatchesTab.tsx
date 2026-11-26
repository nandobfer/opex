"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Eye } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useCancelOpexWatch, useOpexWatches, useOpexWatchesRealtime } from "../../hooks/useOpexWatches"
import { useOpexRealtime, useOpexSessions } from "../../hooks/useOpexSessions"
import type { OpexJobOriginFilter } from "../../jobs"
import type { OpexWatchDto, OpexWatchFilter } from "../../watches"
import { AgentScheduledSkeleton } from "../scheduled/AgentScheduledRow"
import { OpexWatchRow } from "./OpexWatchRow"
import { OpexWatchesFilters } from "./OpexWatchesFilters"

const EMPTY_TEXT: Record<OpexWatchFilter, string> = {
    active: "Nenhuma observação ativa",
    finished: "Nenhuma observação encerrada nos últimos 30 dias",
    all: "Nenhuma observação ainda",
}

/**
 * Observações de evento do Agente Opex (aba "Observações" de Integrações › Crons, OPE-194): o que o agente
 * (do dono e do portal) está observando para acordar sozinho, com o prazo, o que foi combinado e o
 * desfecho. Lista ao vivo, com cancelar e abrir a sessão.
 */
export function OpexWatchesTab() {
    const [filter, setFilter] = useState<OpexWatchFilter>("active")
    const [origin, setOrigin] = useState<OpexJobOriginFilter>("all")
    const [clientId, setClientId] = useState<string | null>(null)
    const [canceling, setCanceling] = useState<OpexWatchDto | null>(null)
    const watches = useOpexWatches({ filter, origin, clientId: origin === "client" ? clientId : null })
    const sessions = useOpexSessions()
    const cancel = useCancelOpexWatch()
    useOpexWatchesRealtime(true)
    useOpexRealtime(true)
    const titles = useMemo(() => new Map((sessions.data ?? []).map((session) => [session.id, session.title])), [sessions.data])

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Card>
                <CardHeader className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Eye className="h-4 w-4 text-primary" aria-hidden /> Observações do Agente Opex
                    </CardTitle>
                    <CardDescription>
                        Eventos que o agente observa para acordar sozinho, uma única vez, quando acontecerem (tarefa, mesa de trabalho, execução de rotineiro, job ou deploy). Enquanto espera, nenhum turno
                        roda. Histórico de 30 dias; horários de Brasília.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <OpexWatchesFilters filter={filter} origin={origin} clientId={clientId} onFilter={setFilter} onOrigin={setOrigin} onClient={setClientId} />
                    {watches.isPending ? (
                        <AgentScheduledSkeleton />
                    ) : watches.isError ? (
                        <ErrorState title="Não foi possível carregar as observações" onRetry={() => void watches.refetch()} />
                    ) : watches.data.length === 0 ? (
                        <EmptyState icon={Eye} title={EMPTY_TEXT[filter]} description="Peça ao Agente Opex para observar uma tarefa, uma mesa ou uma execução e avisar quando algo acontecer." />
                    ) : (
                        <ul className="space-y-2">
                            <AnimatePresence initial={false}>
                                {watches.data.map((watch) => (
                                    <OpexWatchRow key={watch.id} watch={watch} sessionTitle={watch.origin.kind === "owner" ? (titles.get(watch.sessionId) ?? null) : null} onCancel={setCanceling} />
                                ))}
                            </AnimatePresence>
                        </ul>
                    )}
                </CardContent>
            </Card>
            <AlertDialog open={Boolean(canceling)} onOpenChange={(open) => !open && setCanceling(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar a observação?</AlertDialogTitle>
                        <AlertDialogDescription>{canceling?.pillText}. O agente não será acordado por este evento; a observação fica no histórico como cancelada.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (canceling) cancel.mutate(canceling.id)
                                setCanceling(null)
                            }}
                        >
                            Cancelar observação
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.div>
    )
}
