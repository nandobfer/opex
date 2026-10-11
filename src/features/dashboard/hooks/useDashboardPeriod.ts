"use client"

import { useMemo } from "react"
import { usePersistentState } from "@/hooks/usePersistentState"
import { DEFAULT_DASHBOARD_PERIOD, DASHBOARD_PERIOD_STORAGE_KEY, dashboardPeriodSchema, periodRange, type DashboardPeriod } from "../period"

/**
 * Período global da tela Dashboards: a **opção** (7/30/90 dias ou mês atual) fica no navegador; as
 * datas ISO são recalculadas a cada render para não envelhecerem. O fuso IANA do navegador é enviado
 * ao servidor para agrupar as séries temporais.
 */

export function useDashboardPeriod(): {
    period: DashboardPeriod
    setPeriod: (next: DashboardPeriod) => void
    ready: boolean
    range: { from: string; to: string }
    timeZone: string
} {
    const { value: period, setValue, ready } = usePersistentState<DashboardPeriod>(DASHBOARD_PERIOD_STORAGE_KEY, dashboardPeriodSchema, DEFAULT_DASHBOARD_PERIOD)
    const range = useMemo(() => periodRange(period), [period])
    const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", [])
    return { period, setPeriod: setValue, ready, range, timeZone }
}
