import { z } from "zod"

/**
 * Contratos da tela Dashboards. Módulo puro. O cliente envia o intervalo do período global em ISO e o
 * **fuso** IANA do navegador (para o servidor agrupar as séries temporais nos dias/semanas corretos).
 */

export const DASHBOARD_PATH = "/dashboard"

const isoDate = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Data inválida")

/** Fuso IANA válido (ex.: `America/Sao_Paulo`). Vazio/ausente → o servidor usa UTC. */
const timeZone = z.string().refine((value) => {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value })
        return true
    } catch {
        return false
    }
}, "Fuso horário inválido")

export const dashboardQuerySchema = z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    timeZone: timeZone.optional(),
})
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>
