"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { endOfDay, parseISO, startOfDay } from "date-fns"
import { Clock, KeyRound, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DATE_PRESET, PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { listContainer } from "@/components/motion/presets"
import { urlFilterCodecs, useUrlFilters } from "@/hooks/useUrlFilters"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { integrationPath } from "@/lib/integrations/catalog"
import { formatMinutes } from "@/features/tasks/format"
import { groupTimeLogsByDay } from "../grouping"
import { useDeleteTimeLog, useTimeLogs, useUpdateTimeLog } from "../hooks/useTime"
import type { TimeLogDto } from "../types"
import { DeleteTimeLogDialog, EditPeriodDialog } from "./TimeLogDialogs"
import { TimeLogItem } from "./TimeLogItem"
import { TimerIndicator } from "./TimerIndicator"
import { useTimer } from "./TimerProvider"

const swap = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } }
const RANGE_SCHEMA = { from: urlFilterCodecs.string(), to: urlFilterCodecs.string() }

/**
 * Minhas horas (`/tarefas/horas`): meus apontamentos no Go! Sipal por período (na URL), agrupados
 * por dia, com editar descrição/período, excluir e parar o timer ativo.
 */
export function TimeLogsPage() {
    const reduceMotion = useReducedMotion()
    const defaults = useMemo(() => {
        const range = DATE_PRESET.week.getRange()
        return { from: range.startDate, to: range.endDate }
    }, [])
    const [range, setRange] = useUrlFilters(defaults, RANGE_SCHEMA)
    const query = useMemo(
        () => ({
            from: range.from ? startOfDay(parseISO(range.from)).toISOString() : "",
            to: range.to ? endOfDay(parseISO(range.to)).toISOString() : "",
        }),
        [range.from, range.to],
    )
    const logsQuery = useTimeLogs(query)
    const timer = useTimer()
    const update = useUpdateTimeLog()
    const remove = useDeleteTimeLog()
    const [editing, setEditing] = useState<TimeLogDto | null>(null)
    const [deleting, setDeleting] = useState<TimeLogDto | null>(null)

    const pages = useMemo(() => logsQuery.data?.pages ?? [], [logsQuery.data])
    const logs = useMemo(() => pages.flatMap((page) => page.logs), [pages])
    const days = useMemo(() => groupTimeLogsByDay(logs), [logs])
    const totalMinutes = pages[0]?.totalMinutes ?? 0
    const total = pages[0]?.total ?? 0
    const sessionMissing = logsQuery.isError && apiErrorCode(logsQuery.error) === "GO_SIPAL_SESSION"
    const view = logsQuery.isLoading ? "loading" : sessionMissing ? "session" : logsQuery.isError ? "error" : logs.length === 0 ? "empty" : "list"

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                        <Clock className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="text-lg font-semibold md:text-2xl">Minhas horas</h1>
                        <p className="text-sm text-muted-foreground">Apontamentos no Go! Sipal</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <TimerIndicator />
                    <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={() => void logsQuery.refetch()} disabled={logsQuery.isFetching} aria-label="Atualizar apontamentos">
                        <motion.span animate={{ rotate: logsQuery.isFetching ? 360 : 0 }} transition={logsQuery.isFetching ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                            <RefreshCw className="h-4 w-4" aria-hidden />
                        </motion.span>
                        Atualizar
                    </Button>
                </div>
            </header>

            <Card>
                <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-end md:justify-between">
                    <div className="flex flex-col gap-2 md:w-[320px]">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Período</span>
                        <PresetDateRangeFilter startDate={range.from} endDate={range.to} onChange={(next) => setRange({ from: next.startDate, to: next.endDate })} />
                    </div>
                    <div className="flex gap-6">
                        <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total no período</p>
                            <p className="font-mono text-2xl font-bold text-primary">
                                {logsQuery.data ? <AnimatedNumber value={totalMinutes} formatter={formatMinutes} /> : "—"}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Apontamentos</p>
                            <p className="font-mono text-2xl font-bold">{logsQuery.data ? <AnimatedNumber value={total} /> : "—"}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} {...swap}>
                    {view === "loading" && (
                        <div className="space-y-3" aria-label="Carregando apontamentos">
                            <Skeleton className="h-5 w-48" />
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </div>
                    )}
                    {view === "session" && (
                        <EmptyState icon={KeyRound} title="Conecte-se ao Go! Sipal" description={apiErrorMessage(logsQuery.error, "Entre com o código enviado por e-mail.")}>
                            <Button asChild size="sm">
                                <Link href={integrationPath("go_sipal")}>Conectar ao Go! Sipal</Link>
                            </Button>
                        </EmptyState>
                    )}
                    {view === "error" && <ErrorState title="Não foi possível carregar os apontamentos" description={apiErrorMessage(logsQuery.error, "Tente novamente.")} onRetry={() => void logsQuery.refetch()} />}
                    {view === "empty" && <EmptyState icon={Clock} title="Nenhum apontamento neste período" description="Escolha outro período ou inicie um timer numa tarefa." />}
                    {view === "list" && (
                        <div className="space-y-6">
                            {days.map((day) => (
                                <section key={day.key} aria-label={day.label} className="space-y-2">
                                    <div className="flex items-center justify-between px-1">
                                        <h2 className="text-sm font-semibold">{day.label}</h2>
                                        <span className="text-xs text-muted-foreground">
                                            Total: <strong className="font-mono text-foreground">{formatMinutes(day.totalMinutes)}</strong>
                                        </span>
                                    </div>
                                    <motion.ul variants={listContainer} initial="hidden" animate="visible" className="space-y-2">
                                        <AnimatePresence initial={false}>
                                            {day.logs.map((log) => (
                                                <TimeLogItem
                                                    key={log.id}
                                                    log={log}
                                                    savingDescription={update.isPending && update.variables?.log.id === log.id}
                                                    onSaveDescription={async (description) => {
                                                        try {
                                                            await update.mutateAsync({ log, input: { kind: "description", description } })
                                                            return true
                                                        } catch (error) {
                                                                                            toast.error(apiErrorMessage(error, "Não foi possível salvar a descrição"))
                                                            return false
                                                        }
                                                    }}
                                                    onEditPeriod={() => setEditing(log)}
                                                    onDelete={() => setDeleting(log)}
                                                    onStop={() => timer?.requestStop(log)}
                                                />
                                            ))}
                                        </AnimatePresence>
                                    </motion.ul>
                                </section>
                            ))}
                            {logsQuery.hasNextPage && (
                                <div className="flex justify-center">
                                    <Button type="button" variant="outline" onClick={() => void logsQuery.fetchNextPage()} disabled={logsQuery.isFetchingNextPage}>
                                        {logsQuery.isFetchingNextPage && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                                        Carregar mais ({logs.length} de {total})
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            <EditPeriodDialog
                log={editing}
                submitting={update.isPending}
                onClose={() => setEditing(null)}
                onSubmit={async (input) => {
                    if (!editing) return
                    try {
                        await update.mutateAsync({ log: editing, input: { kind: "period", ...input } })
                        setEditing(null)
                    } catch (error) {
                        toast.error(apiErrorMessage(error, "Não foi possível alterar o período"))
                    }
                }}
            />
            <DeleteTimeLogDialog
                log={deleting}
                submitting={remove.isPending}
                onClose={() => setDeleting(null)}
                onSubmit={async (justification) => {
                    if (!deleting) return
                    try {
                        await remove.mutateAsync({ log: deleting, justification })
                        setDeleting(null)
                    } catch (error) {
                        toast.error(apiErrorMessage(error, "Não foi possível excluir o apontamento"))
                    }
                }}
            />
        </motion.section>
    )
}
