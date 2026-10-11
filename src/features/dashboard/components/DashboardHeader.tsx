"use client"

import { motion } from "framer-motion"
import { LayoutDashboard, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OptionTabs } from "@/components/ui/option-tabs"
import { DASHBOARD_PERIOD_LABELS, DASHBOARD_PERIODS, type DashboardPeriod } from "../period"

/** Cabeçalho da tela: título, seletor do período global e botão Atualizar (com rotação animada). */
export function DashboardHeader({
    period,
    onPeriodChange,
    onRefresh,
    refreshing,
}: {
    period: DashboardPeriod
    onPeriodChange: (period: DashboardPeriod) => void
    onRefresh: () => void
    refreshing: boolean
}) {
    return (
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                    <LayoutDashboard className="h-5 w-5" aria-hidden />
                </span>
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">Dashboards</h1>
                    <p className="text-sm text-muted-foreground">Visão geral de tarefas, financeiro, horas agênticas e desenvolvimento</p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <OptionTabs
                    aria-label="Período"
                    value={period}
                    onChange={onPeriodChange}
                    options={DASHBOARD_PERIODS.map((value) => ({ value, label: DASHBOARD_PERIOD_LABELS[value] }))}
                />
                <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={onRefresh} disabled={refreshing} aria-label="Atualizar dashboards">
                    <motion.span animate={{ rotate: refreshing ? 360 : 0 }} transition={refreshing ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </motion.span>
                    Atualizar
                </Button>
            </div>
        </header>
    )
}
