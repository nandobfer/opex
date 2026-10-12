"use client"

import { useMemo } from "react"
import { DEFAULT_DASHBOARD_PERIOD, dashboardPeriodSchema, periodRange, type DashboardPeriod } from "@/features/dashboard/period"
import { usePersistentState } from "@/hooks/usePersistentState"
import { CLIENTE_PERIOD_STORAGE_KEY } from "./period"

/**
 * Período do dashboard do portal: mesmo comportamento do dashboard do dono (opção persistida no
 * navegador, datas ISO recalculadas a cada render, fuso IANA do navegador enviado ao servidor), só
 * que com a chave de armazenamento do portal.
 */
export function useClientePeriod(): {
    period: DashboardPeriod
    setPeriod: (next: DashboardPeriod) => void
    ready: boolean
    range: { from: string; to: string }
    timeZone: string
} {
    const { value: period, setValue, ready } = usePersistentState<DashboardPeriod>(CLIENTE_PERIOD_STORAGE_KEY, dashboardPeriodSchema, DEFAULT_DASHBOARD_PERIOD)
    const range = useMemo(() => periodRange(period), [period])
    const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", [])
    return { period, setPeriod: setValue, ready, range, timeZone }
}
