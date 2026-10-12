import { DASHBOARD_PERIOD_LABELS, DASHBOARD_PERIODS, type DashboardPeriod } from "@/features/dashboard/period"

/**
 * Período do dashboard do **portal do cliente**: mesmas opções e mesmo cálculo do dashboard do dono
 * (7 / 30 / 90 dias ou mês atual), mas com **chave própria** de persistência — a preferência do
 * cliente não compartilha estado com a do dono.
 */

/** Mesmo tipo de período do dashboard do dono. */
export type ClientePeriod = DashboardPeriod

/** Chave de `localStorage` da preferência do portal (separada da chave do dono). */
export const CLIENTE_PERIOD_STORAGE_KEY = "opex:cliente:dashboard:period:v1"

/** Opções do seletor, com os mesmos rótulos do dono. */
export const CLIENTE_PERIOD_OPTIONS: ReadonlyArray<{ value: ClientePeriod; label: string }> = DASHBOARD_PERIODS.map((value) => ({
    value,
    label: DASHBOARD_PERIOD_LABELS[value],
}))
