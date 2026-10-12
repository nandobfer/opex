"use client"

import { useCallback } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { LayoutDashboard } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useDashboard, useDashboardRealtime } from "../hooks/useDashboard"
import { useDashboardPeriod } from "../hooks/useDashboardPeriod"
import { TaskCreationActions } from "@/features/tasks/components/TaskCreationActions"
import { TimerIndicator } from "@/features/time/components/TimerIndicator"
import { AgenticHoursSection } from "./AgenticHoursSection"
import { DashboardHeader } from "./DashboardHeader"
import { DashboardKpis, dashboardKpiItems } from "./DashboardKpis"
import { DashboardSkeleton } from "./DashboardSkeleton"
import { DevCenterSection } from "./DevCenterSection"
import { FinanceSection } from "./FinanceSection"
import { TasksOverviewSection } from "./TasksOverviewSection"

const swap = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } }

/**
 * Dashboards (`/dashboard`): página inicial dO Opex. Um período global no topo alimenta um único
 * endpoint agregado (KPIs + quatro blocos) e os eventos do Pusher recarregam a consulta.
 */
export function DashboardPage() {
    const reduceMotion = useReducedMotion()
    const { period, setPeriod, ready, range, timeZone } = useDashboardPeriod()
    useDashboardRealtime()
    const query = useDashboard({ from: range.from, to: range.to, timeZone }, ready)

    const data = query.data
    const view = !ready || query.isLoading ? "loading" : query.isError ? "error" : !data ? "empty" : "ready"
    const refresh = useCallback(() => void query.refetch(), [query])

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="space-y-6">
            <DashboardHeader
                title="Dashboards"
                description="Visão geral de tarefas, financeiro, horas agênticas e desenvolvimento"
                actions={
                    <>
                        <TimerIndicator />
                        <TaskCreationActions />
                    </>
                }
                period={period}
                onPeriodChange={setPeriod}
                onRefresh={refresh}
                refreshing={query.isFetching}
            />

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} {...swap} className="space-y-6">
                    {view === "loading" && <DashboardSkeleton />}
                    {view === "error" && (
                        <ErrorState title="Não foi possível carregar os dashboards" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={refresh} />
                    )}
                    {view === "empty" && <EmptyState icon={LayoutDashboard} title="Nada para mostrar" description="Ajuste o período ou cadastre tarefas para ver os indicadores." />}
                    {view === "ready" && data && (
                        <>
                            <DashboardKpis items={dashboardKpiItems(data.kpis)} />
                            <TasksOverviewSection data={data} />
                            <FinanceSection data={data} />
                            <AgenticHoursSection data={data} />
                            <DevCenterSection data={data} active={data.kpis.activeWorkbenches} running={data.kpis.runningWorkbenches} />
                        </>
                    )}
                </motion.div>
            </AnimatePresence>
        </motion.section>
    )
}
