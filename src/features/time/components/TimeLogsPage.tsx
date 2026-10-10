"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { endOfDay, parseISO, startOfDay } from "date-fns"
import { Clock, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DATE_PRESET, PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { listContainer } from "@/components/motion/presets"
import { urlFilterCodecs, useUrlFilters } from "@/hooks/useUrlFilters"
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll"
import { apiErrorMessage } from "@/lib/api"
import { formatMinutes } from "@/features/tasks/format"
import { formatCostUsd } from "../format"
import { groupTimeLogsByDay, groupTimeLogsByTask } from "../grouping"
import { useTimeLogs } from "../hooks/useTime"
import { TimeLogTaskGroup } from "./TimeLogTaskGroup"
import { TimerIndicator } from "./TimerIndicator"

const swap = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } }
const RANGE_SCHEMA = { from: urlFilterCodecs.string(), to: urlFilterCodecs.string() }

/**
 * Horas agênticas (`/tarefas/horas`): apontamentos das mesas por período (na URL), agrupados por dia
 * e, dentro de cada dia, por task/mesa (grupos expansíveis, recolhidos por padrão). **Somente leitura**
 * — o timer é controlado pela mesa de trabalho; aqui só se consulta.
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
    const { sentinelRef, supported } = useInfiniteScroll({
        onLoadMore: () => void logsQuery.fetchNextPage(),
        disabled: !logsQuery.hasNextPage || logsQuery.isFetchingNextPage || logsQuery.isFetchNextPageError,
    })

    const pages = useMemo(() => logsQuery.data?.pages ?? [], [logsQuery.data])
    const logs = useMemo(() => pages.flatMap((page) => page.logs), [pages])
    const days = useMemo(() => groupTimeLogsByDay(logs), [logs])
    const dayGroups = useMemo(() => days.map((day) => ({ day, groups: groupTimeLogsByTask(day.logs) })), [days])

    // Grupos (`dia:task`) abertos manualmente. Começam recolhidos; os que têm período ativo ficam
    // sempre abertos — a abertura é derivada, sem estado sincronizado em efeito.
    const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
    const toggleGroup = (key: string) =>
        setOpenGroups((current) => {
            const next = new Set(current)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    const totalMinutes = pages[0]?.totalMinutes ?? 0
    const totalCostUsd = pages[0]?.totalCostUsd ?? 0
    const total = pages[0]?.total ?? 0
    const view = logsQuery.isLoading ? "loading" : logsQuery.isError ? "error" : logs.length === 0 ? "empty" : "list"

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                        <Clock className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="text-lg font-semibold md:text-2xl">Horas agênticas</h1>
                        <p className="text-sm text-muted-foreground">Tempo e uso das mesas de desenvolvimento</p>
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
                            <p className="font-mono text-2xl font-bold text-primary">{logsQuery.data ? <AnimatedNumber value={totalMinutes} formatter={formatMinutes} /> : "—"}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Apontamentos</p>
                            <p className="font-mono text-2xl font-bold">{logsQuery.data ? <AnimatedNumber value={total} /> : "—"}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Custo</p>
                            <p className="font-mono text-2xl font-bold">{logsQuery.data ? formatCostUsd(totalCostUsd) : "—"}</p>
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
                    {view === "error" && <ErrorState title="Não foi possível carregar os apontamentos" description={apiErrorMessage(logsQuery.error, "Tente novamente.")} onRetry={() => void logsQuery.refetch()} />}
                    {view === "empty" && <EmptyState icon={Clock} title="Nenhum apontamento neste período" description="Abra uma mesa de trabalho para o tempo começar a ser registrado." />}
                    {view === "list" && (
                        <div className="space-y-6">
                            {dayGroups.map(({ day, groups }) => (
                                <section key={day.key} aria-label={day.label} className="space-y-2">
                                    <div className="flex items-center justify-between px-1">
                                        <h2 className="text-sm font-semibold">{day.label}</h2>
                                        <span className="text-xs text-muted-foreground">
                                            Total: <strong className="font-mono text-foreground">{formatMinutes(day.totalMinutes)}</strong>
                                        </span>
                                    </div>
                                    <motion.div variants={listContainer} initial="hidden" animate="visible" className="space-y-2">
                                        <AnimatePresence initial={false}>
                                            {groups.map((group) => {
                                                const key = `${day.key}:${group.key}`
                                                return (
                                                    <TimeLogTaskGroup
                                                        key={key}
                                                        group={group}
                                                        open={group.hasActive || openGroups.has(key)}
                                                        onToggle={() => {
                                                            if (!group.hasActive) toggleGroup(key)
                                                        }}
                                                    />
                                                )
                                            })}
                                        </AnimatePresence>
                                    </motion.div>
                                </section>
                            ))}
                            <div ref={sentinelRef} aria-hidden className="h-px w-full" />
                            {logsQuery.isFetchingNextPage && (
                                <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                    <motion.span animate={{ rotate: reduceMotion ? 0 : 360 }} transition={reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 0.9, ease: "linear" }} className="inline-flex">
                                        <Loader2 className="h-4 w-4" aria-hidden />
                                    </motion.span>
                                    Carregando mais apontamentos…
                                </div>
                            )}
                            {!supported && logsQuery.hasNextPage && (
                                <div className="flex justify-center">
                                    <Button type="button" variant="outline" onClick={() => void logsQuery.fetchNextPage()} disabled={logsQuery.isFetchingNextPage}>
                                        {logsQuery.isFetchingNextPage && (
                                            <motion.span animate={{ rotate: reduceMotion ? 0 : 360 }} transition={reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 0.9, ease: "linear" }} className="mr-1.5 inline-flex">
                                                <Loader2 className="h-3.5 w-3.5" aria-hidden />
                                            </motion.span>
                                        )}
                                        Carregar mais ({logs.length} de {total})
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </motion.section>
    )
}
