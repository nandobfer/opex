"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Banknote, ChevronDown, Github, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { apiErrorMessage } from "@/lib/api"
import { formatBillingBrl, formatHours } from "@/features/finance/format"
import { formatDateTime } from "@/features/tasks/format"
import { CLIENTE_COST_LABEL } from "../constants"
import { useClienteOptions } from "./hooks"
import { useClienteFinance } from "./hooks"
import { CLIENTE_PERIOD_OPTIONS, clientPeriodRange, type ClientePeriod } from "./period"

/** Financeiro do cliente: custo das tarefas concluídas, agrupado por repositório. */
export function ClienteFinanceiroPage() {
    const [now] = useState(() => new Date())
    const [period, setPeriod] = useState<ClientePeriod>("month")
    const [projectIds, setProjectIds] = useState<string[]>([])
    const range = useMemo(() => clientPeriodRange(period, now), [period, now])
    const options = useClienteOptions()
    const query = useClienteFinance(range.from, range.to, projectIds)
    const data = query.data
    const repoOptions = useMemo(() => (options.data?.projects ?? []).map((project) => ({ value: project.id, label: project.repo })), [options.data])

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-5">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">Financeiro</h1>
                    <p className="text-sm text-muted-foreground">Custo das tarefas concluídas, por repositório.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <CadastroMultiSelect
                        icon={Github}
                        placeholder="Repositórios"
                        options={repoOptions}
                        selected={projectIds}
                        onSelect={setProjectIds}
                        searchable
                        searchPlaceholder="Buscar repositório..."
                    />
                    <Select value={period} onValueChange={(value) => setPeriod(value as ClientePeriod)}>
                        <SelectTrigger className="h-9 w-[170px]" aria-label="Período">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {CLIENTE_PERIOD_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={() => void query.refetch()} disabled={query.isFetching}>
                        <RefreshCw className="h-4 w-4" aria-hidden /> Atualizar
                    </Button>
                </div>
            </header>

            {query.isLoading ? (
                <Skeleton className="h-64 w-full" />
            ) : query.isError || !data ? (
                <ErrorState title="Não foi possível carregar o financeiro" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Totais do período</CardTitle>
                            <CardDescription>Custo total das tarefas concluídas.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-3">
                            <div>
                                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                                    <Banknote className="h-3.5 w-3.5" aria-hidden /> {CLIENTE_COST_LABEL}
                                </p>
                                <p className="mt-1 text-2xl font-semibold">
                                    <AnimatedNumber value={data.totals.totalCostBrl} formatter={formatBillingBrl} />
                                </p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Horas</p>
                                <p className="mt-1 text-2xl font-semibold">{formatHours(data.totals.totalClientHours)} h</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Tarefas concluídas</p>
                                <p className="mt-1 text-2xl font-semibold">{data.totals.taskCount}</p>
                            </div>
                        </CardContent>
                    </Card>

                    {data.groups.length === 0 ? (
                        <EmptyState icon={Banknote} title="Nenhuma conclusão no período" description="Ajuste o período ou os repositórios para ver o custo das tarefas concluídas." />
                    ) : (
                        <div className="space-y-3">
                            {data.groups.map((group) => (
                                <ClienteCostGroup key={group.projectId ?? "__sem__"} group={group} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </motion.section>
    )
}

function ClienteCostGroup({ group }: { group: import("../types").ClienteCostGroupDto }) {
    const [open, setOpen] = useState(false)
    const reduceMotion = useReducedMotion()

    return (
        <Card>
            <button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                <div className="min-w-0">
                    <p className="truncate font-medium">{group.repo}</p>
                    <p className="text-xs text-muted-foreground">
                        {group.taskCount} {group.taskCount === 1 ? "tarefa" : "tarefas"} · {formatHours(group.totalClientHours)} h
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold">{formatBillingBrl(group.totalCostBrl)}</span>
                    <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }}>
                        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </motion.span>
                </div>
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className="overflow-hidden">
                        <ul className="divide-y border-t">
                            {group.tasks.map((task) => (
                                <li key={task.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm">
                                            <span className="mr-1.5 font-mono text-xs text-muted-foreground">{task.code}</span>
                                            {task.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Concluída em {formatDateTime(task.completedAt)}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="font-mono text-sm">{formatBillingBrl(task.costBrl)}</p>
                                        <p className="text-xs text-muted-foreground">{formatHours(task.clientHours)} h</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    )
}
