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
import { formatBillingBrl, formatHours } from "@/features/finance/format"
import { CLIENTE_COST_LABEL, clienteTarefaPath } from "../constants"
import { repoLabelIndex } from "../logic"
import { CLIENTE_FINANCE_FILTER_SCHEMA, clienteFinanceQuery, defaultClienteFinanceFilters, hasClienteRepoFilter } from "./filters"
import { useClienteFinance, useClienteOptions, useClienteRealtime } from "./hooks"
import { ClienteCostGroup } from "./components/ClienteCostGroup"
import { ClienteFinanceFiltersBar } from "./components/ClienteFinanceFiltersBar"

const swap = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } }

/**
 * Financeiro do portal (`/cliente/financeiro`): o **mesmo padrão** do Financeiro do dono — filtros no
 * kit de listas (período e repositórios na **URL**, padrão mês corrente), cartão de totais, botão
 * Atualizar e grupos expansíveis com as tarefas. Agrupa por **repositório** (o cliente já é o da
 * sessão) e mostra o valor como **Custo**, com as horas infladas ao cliente — **somente leitura**.
 */
export function ClienteFinanceiroPage() {
    const reduceMotion = useReducedMotion()
    const defaults = useMemo(() => defaultClienteFinanceFilters(), [])
    const [filters, setFilters, resetFilters] = useUrlFilters(defaults, CLIENTE_FINANCE_FILTER_SCHEMA)
    const params = useMemo(() => clienteFinanceQuery(filters), [filters])
    const query = useClienteFinance(params)
    const options = useClienteOptions()
    useClienteRealtime()

    const projects = useMemo(() => options.data?.projects ?? [], [options.data])
    const repoIndex = useMemo(() => repoLabelIndex(projects), [projects])

    // Grupos abertos manualmente. Começam recolhidos.
    const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
    const toggleGroup = (key: string) =>
        setOpenGroups((current) => {
            const next = new Set(current)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })

    const clearSelection = () => setFilters((prev) => ({ ...prev, projectIds: [] }))

    const data = query.data
    const totals = data?.totals
    const hasSelection = hasClienteRepoFilter(filters)
    const view = query.isLoading ? "loading" : query.isError ? "error" : !data || data.groups.length === 0 ? "empty" : "list"

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                        <Banknote className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="text-lg font-semibold md:text-2xl">Financeiro</h1>
                        <p className="text-sm text-muted-foreground">{CLIENTE_COST_LABEL} das tarefas concluídas por repositório</p>
                    </div>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Atualizar financeiro">
                    <motion.span animate={{ rotate: query.isFetching ? 360 : 0 }} transition={query.isFetching ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </motion.span>
                    Atualizar
                </Button>
            </header>

            <ClienteFinanceFiltersBar filters={filters} setFilters={setFilters} onClear={resetFilters} total={totals?.taskCount} projects={projects} />

            <Card>
                <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{`${CLIENTE_COST_LABEL} no período`}</p>
                        <p className="font-mono text-2xl font-bold text-primary">{data ? <AnimatedNumber value={totals?.totalCostBrl ?? 0} formatter={formatBillingBrl} /> : "—"}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Horas</p>
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
                    {view === "error" && <ErrorState title="Não foi possível carregar o financeiro" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />}
                    {view === "empty" &&
                        (hasSelection ? (
                            <EmptyState
                                icon={Filter}
                                title="Nenhuma tarefa para os filtros selecionados"
                                description="Ajuste o período ou o repositório, ou limpe a seleção para ver todas as tarefas do período."
                                actionLabel="Limpar seleção"
                                onAction={clearSelection}
                            />
                        ) : (
                            <EmptyState icon={Banknote} title="Nenhuma tarefa concluída neste período" description="As tarefas concluídas com estimativa aparecem aqui, agrupadas por repositório." />
                        ))}
                    {view === "list" && (
                        <motion.div variants={listContainer} initial="hidden" animate="visible" className="space-y-2">
                            <AnimatePresence initial={false}>
                                {data!.groups.map((group) => {
                                    const key = group.projectId ?? "__sem__"
                                    return <ClienteCostGroup key={key} group={group} open={openGroups.has(key)} onToggle={() => toggleGroup(key)} repoIndex={repoIndex} hrefFor={clienteTarefaPath} />
                                })}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </motion.div>
            </AnimatePresence>

            {query.isFetching && !query.isLoading && (
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
