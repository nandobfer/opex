"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Banknote, CheckCircle2, LayoutList, ListTodo, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { apiErrorMessage } from "@/lib/api"
import { formatBillingBrl, formatHours } from "@/features/finance/format"
import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS, type TaskPriority, type TaskType } from "@/features/tasks/constants"
import { CLIENTE_COST_LABEL } from "../constants"
import { useClientePortal } from "./ClientePortalContext"
import { useClienteDashboard } from "./hooks"
import { CLIENTE_PERIOD_OPTIONS, clientPeriodRange, type ClientePeriod } from "./period"

/** Dashboard do cliente: KPIs de tarefas e, para o admin, o bloco de **custo** (sem dados internos). */
export function ClienteDashboardPage() {
    const { isAdmin } = useClientePortal()
    const [now] = useState(() => new Date())
    const [period, setPeriod] = useState<ClientePeriod>("month")
    const range = useMemo(() => clientPeriodRange(period, now), [period, now])
    const query = useClienteDashboard(range.from, range.to)
    const data = query.data

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-5">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">Dashboard</h1>
                    <p className="text-sm text-muted-foreground">Visão das suas tarefas no período.</p>
                </div>
                <div className="flex items-center gap-2">
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
                <div className="grid gap-4 sm:grid-cols-3">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            ) : query.isError || !data ? (
                <ErrorState title="Não foi possível carregar o dashboard" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <StatCard icon={ListTodo} label="Tarefas ativas" value={data.tasksActive} />
                        <StatCard icon={LayoutList} label="Criadas no período" value={data.tasksCreated} />
                        <StatCard icon={CheckCircle2} label="Concluídas no período" value={data.tasksCompleted} />
                    </div>

                    {isAdmin && data.cost && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">{CLIENTE_COST_LABEL}</CardTitle>
                                <CardDescription>Custo das suas tarefas concluídas no período.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4 sm:grid-cols-3">
                                <StatBox label={`${CLIENTE_COST_LABEL} total`} value={formatBillingBrl(data.cost.totalCostBrl)} icon={Banknote} />
                                <StatBox label="Horas" value={`${formatHours(data.cost.totalClientHours)} h`} />
                                <StatBox label="Tarefas concluídas" value={String(data.cost.completedTasks)} />
                            </CardContent>
                        </Card>
                    )}

                    <div className="grid gap-4 lg:grid-cols-3">
                        <DistributionCard title="Por coluna" items={data.byColumn.map((item) => ({ label: item.label, count: item.count }))} emptyText="Sem tarefas ativas." />
                        <DistributionCard title="Por prioridade" items={data.byPriority.map((item) => ({ label: TASK_PRIORITY_LABELS[item.priority as TaskPriority] ?? item.priority, count: item.count }))} emptyText="Sem tarefas ativas." />
                        <DistributionCard title="Por tipo" items={data.byType.map((item) => ({ label: item.type ? (TASK_TYPE_LABELS[item.type as TaskType] ?? item.type) : "Sem tipo", count: item.count }))} emptyText="Sem tarefas ativas." />
                    </div>
                </>
            )}
        </motion.section>
    )
}

function StatCard({ icon: Icon, label, value }: { icon: typeof ListTodo; label: string; value: number }) {
    return (
        <Card>
            <CardContent className="flex items-center gap-3 pt-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                    <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="text-2xl font-semibold">
                        <AnimatedNumber value={value} />
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}

function StatBox({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Banknote }) {
    return (
        <div className="rounded-lg border bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />} {label}
            </p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
        </div>
    )
}

function DistributionCard({ title, items, emptyText }: { title: string; items: ReadonlyArray<{ label: string; count: number }>; emptyText: string }) {
    const max = Math.max(1, ...items.map((item) => item.count))
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {items.length === 0 ? (
                    <EmptyState icon={LayoutList} title={emptyText} />
                ) : (
                    <ul className="space-y-2">
                        {items.map((item) => (
                            <li key={item.label} className="space-y-1">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="truncate">{item.label}</span>
                                    <span className="font-mono text-muted-foreground">{item.count}</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${(item.count / max) * 100}%` }} transition={{ duration: 0.3 }} className="h-full rounded-full bg-primary" />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
