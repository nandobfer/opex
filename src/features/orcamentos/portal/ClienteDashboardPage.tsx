"use client"

import { useCallback } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { LayoutDashboard } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { DashboardHeader } from "@/features/dashboard/components/DashboardHeader"
import { DashboardKpis, type DashboardKpiItem } from "@/features/dashboard/components/DashboardKpis"
import { formatBrl, formatCount, formatHours } from "@/features/dashboard/format"
import { CLIENTE_COST_LABEL } from "../constants"
import { useClientePortal } from "./ClientePortalContext"
import { ClienteFinanceSection } from "./components/ClienteFinanceSection"
import { ClienteNewPreviewButton } from "./components/ClienteNewPreviewButton"
import { ClienteTasksOverviewSection } from "./components/ClienteTasksOverviewSection"
import { useClienteDashboard, useClienteRealtime } from "./hooks"
import { useClientePeriod } from "./useClientePeriod"

const swap = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } }

/**
 * Dashboard do portal do cliente: **mesma apresentação** do dashboard do dono (cabeçalho com ícone,
 * atalho de criação, período global e botão Atualizar; KPIs; gráficos), porém restrito ao cliente da
 * sessão. Os KPIs mostram tarefas ativas, criadas e concluídas no período e, para o **admin** do
 * cliente, o **custo** e as horas infladas. Nada de horas agênticas, custo de IA ou mesas.
 */
export function ClienteDashboardPage() {
    const reduceMotion = useReducedMotion()
    const { isAdmin } = useClientePortal()
    const { period, setPeriod, ready, range, timeZone } = useClientePeriod()
    useClienteRealtime()
    const query = useClienteDashboard({ from: range.from, to: range.to, timeZone }, ready)

    const data = query.data
    const view = !ready || query.isLoading ? "loading" : query.isError ? "error" : !data ? "empty" : "ready"
    const refresh = useCallback(() => void query.refetch(), [query])

    const kpis: DashboardKpiItem[] = data
        ? [
              { label: "Tarefas ativas", hint: "Não arquivadas", value: data.tasksActive, formatter: formatCount },
              { label: "Criadas", hint: "No período", value: data.tasksCreated, formatter: formatCount },
              { label: "Concluídas", hint: "No período", value: data.tasksCompleted, formatter: formatCount },
              ...(data.finance
                  ? [
                        { label: CLIENTE_COST_LABEL, hint: "No período", value: data.finance.totals.totalCostBrl, formatter: formatBrl },
                        { label: "Horas", hint: "No período", value: data.finance.totals.totalClientHours, formatter: formatHours },
                    ]
                  : []),
          ]
        : []

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="space-y-6">
            <DashboardHeader title="Dashboard" description="Visão das suas tarefas no período" actions={<ClienteNewPreviewButton />} period={period} onPeriodChange={setPeriod} onRefresh={refresh} refreshing={query.isFetching} />

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} {...swap} className="space-y-6">
                    {view === "loading" && <ClienteDashboardSkeleton admin={isAdmin} />}
                    {view === "error" && <ErrorState title="Não foi possível carregar o dashboard" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={refresh} />}
                    {view === "empty" && <EmptyState icon={LayoutDashboard} title="Nada para mostrar" description="Ajuste o período ou crie uma nova prévia para ver os indicadores." />}
                    {view === "ready" && data && (
                        <>
                            <DashboardKpis items={kpis} />
                            <ClienteTasksOverviewSection data={data} />
                            {data.finance && <ClienteFinanceSection data={data.finance} />}
                        </>
                    )}
                </motion.div>
            </AnimatePresence>
        </motion.section>
    )
}

/** Esqueleto no formato real da tela (KPIs + quatro gráficos; o custo só para o admin). */
function ClienteDashboardSkeleton({ admin }: { admin: boolean }) {
    return (
        <div className="space-y-6" aria-label="Carregando dashboard">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: admin ? 5 : 3 }, (_, index) => (
                    <Card key={index}>
                        <CardContent className="flex flex-col gap-2 p-4">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-6 w-14" />
                            <Skeleton className="h-3 w-24" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-[300px] w-full" />
                ))}
            </div>
        </div>
    )
}
