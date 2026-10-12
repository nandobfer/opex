import { endOfDay, startOfDay, startOfMonth, subDays } from "date-fns"

/** Períodos do dashboard/financeiro do portal. */
export type ClientePeriod = "month" | "30" | "90"

export const CLIENTE_PERIOD_OPTIONS: ReadonlyArray<{ value: ClientePeriod; label: string }> = [
    { value: "month", label: "Mês atual" },
    { value: "30", label: "Últimos 30 dias" },
    { value: "90", label: "Últimos 90 dias" },
]

/**
 * Intervalo `[from, to]` (ISO) do período escolhido, relativo a `now`. O `to` sempre vai até o fim do
 * dia de hoje, para o mês atual não cortar as conclusões de hoje.
 */
export function clientPeriodRange(period: ClientePeriod, now: Date): { from: string; to: string } {
    const to = endOfDay(now).toISOString()
    if (period === "month") return { from: startOfMonth(now).toISOString(), to }
    const days = period === "30" ? 29 : 89
    return { from: startOfDay(subDays(now, days)).toISOString(), to }
}
