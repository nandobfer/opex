"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Banknote, Filter, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { listContainer } from "@/components/motion/presets"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { apiErrorMessage } from "@/lib/api"
import { useTaskOptions } from "@/features/tasks/hooks/useTasks"
import { useOrcamentoClients } from "@/features/orcamentos/hooks/useOrcamentos"
import { defaultFinanceFilters, FINANCE_FILTER_SCHEMA, hasSelectionFilters } from "../filters"
import { formatBillingBrl, formatHours } from "../format"
import { useFinanceByClient, useFinanceRealtime } from "../hooks/useFinance"
import { FinanceClientGroup } from "./FinanceClientGroup"
import { FinanceFiltersBar } from "./FinanceFiltersBar"

const swap = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } }

/**
 * Financeiro (`/financeiro`): faturamento das tarefas **concluídas** agrupado por **cliente**, por
 * período e filtros de cliente/repositório (na URL; período padrão = mês corrente). Cada cliente é
 * expansível para listar as tarefas. **Somente leitura** — o valor é o snapshot da estimativa e a
 * conclusão vem da auditoria.
 */
export function FinancePage() {
    const reduceMotion = useReducedMotion()
    const defaults = useMemo(() => defaultFinanceFilters(), [])
    const [filters, setFilters, resetFilters] = useUrlFilters(defaults, FINANCE_FILTER_SCHEMA)
    const financeQuery = useFinanceByClient(filters)
    useFinanceRealtime()

    // Opções dos filtros (carregam independentemente do resultado financeiro).
    const clientsQuery = useOrcamentoClients()
    const projectsQuery = useTaskOptions()

    // Grupos abertos manualmente. Começam recolhidos.
    const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
    const toggleGroup = (key: string) =>
        setOpenGroups((current) => {
            const next = new Set(current)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })

    const clearSelection = () => setFilters((prev) => ({ ...prev, clientIds: [], projectIds: [] }))

    const data = financeQuery.data
    const totals = data?.totals
    const hasSelection = hasSelectionFilters(filters)
    const view = financeQuery.isLoading ? "loading" : financeQuery.isError ? "error" : !data || data.groups.length === 0 ? "empty" : "list"

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                        <Banknote className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="text-lg font-semibold md:text-2xl">Financeiro</h1>
                        <p className="text-sm text-muted-foreground">Faturamento das tarefas concluídas por cliente</p>
                    </div>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={() => void financeQuery.refetch()} disabled={financeQuery.isFetching} aria-label="Atualizar financeiro">
                    <motion.span animate={{ rotate: financeQuery.isFetching ? 360 : 0 }} transition={financeQuery.isFetching ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </motion.span>
                    Atualizar
                </Button>
            </header>

            <FinanceFiltersBar
                filters={filters}
                setFilters={setFilters}
                onClear={resetFilters}
                total={totals?.taskCount}
                clients={clientsQuery.data ?? []}
                projects={projectsQuery.data?.projects ?? []}
            />

            <Card>
                <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Faturamento no período</p>
                        <p className="font-mono text-2xl font-bold text-primary">{data ? <AnimatedNumber value={totals?.totalBillingBrl ?? 0} formatter={formatBillingBrl} /> : "—"}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Horas (cliente)</p>
                        <p className="font-mono text-2xl font-bold">{data ? <AnimatedNumber value={totals?.totalClientHours ?? 0} formatter={formatHours} /> : "—"}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tarefas</p>
                        <p className="font-mono text-2xl font-bold">{data ? <AnimatedNumber value={totals?.taskCount ?? 0} /> : "—"}</p>
                    </div>
                </CardContent>
            </Card>

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} {...swap}>
                    {view === "loading" && (
                        <div className="space-y-3" aria-label="Carregando financeiro">
                            <Skeleton className="h-5 w-48" />
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                        </div>
                    )}
                    {view === "error" && <ErrorState title="Não foi possível carregar o financeiro" description={apiErrorMessage(financeQuery.error, "Tente novamente.")} onRetry={() => void financeQuery.refetch()} />}
                    {view === "empty" &&
                        (hasSelection ? (
                            <EmptyState
                                icon={Filter}
                                title="Nenhuma tarefa para os filtros selecionados"
                                description="Ajuste os filtros de cliente ou repositório, ou limpe a seleção para ver todas as tarefas do período."
                                actionLabel="Limpar seleção"
                                onAction={clearSelection}
                            />
                        ) : (
                            <EmptyState icon={Banknote} title="Nenhuma tarefa concluída neste período" description="Conclua tarefas com estimativa para vê-las aqui, agrupadas por cliente." />
                        ))}
                    {view === "list" && (
                        <motion.div variants={listContainer} initial="hidden" animate="visible" className="space-y-2">
                            <AnimatePresence initial={false}>
                                {data!.groups.map((group) => {
                                    const key = group.clientId ?? "__removed__"
                                    return <FinanceClientGroup key={key} group={group} open={openGroups.has(key)} onToggle={() => toggleGroup(key)} />
                                })}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </motion.div>
            </AnimatePresence>

            {financeQuery.isFetching && !financeQuery.isLoading && (
                <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <motion.span animate={{ rotate: reduceMotion ? 0 : 360 }} transition={reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 0.9, ease: "linear" }} className="inline-flex">
                        <Loader2 className="h-3.5 w-3.5" aria-hidden />
                    </motion.span>
                    Atualizando…
                </div>
            )}
        </motion.section>
    )
}
