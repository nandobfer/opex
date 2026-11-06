import { z } from "zod"

/** Uma medida: percentual e usado/total (bytes; na CPU, núcleos lógicos). Mesmo contrato do RPC do opencode-htop. */
export const hostUsageSchema = z.object({ percent: z.number(), used: z.number(), total: z.number() })

/** Saída do RPC `opencode-htop.stats` (e do parser do shell). */
export const hostMetricsSchema = z.object({ cpu: hostUsageSchema, memory: hostUsageSchema, swap: hostUsageSchema, disk: hostUsageSchema })

export const hostMetricsStateSchema = z.enum(["ok", "unconfigured", "error"])

/** DTO da tela, da rota e do evento em tempo real (o cliente valida o payload com ele). */
export const hostMetricsDtoSchema = z.object({
    state: hostMetricsStateSchema,
    message: z.string().nullable(),
    /** Última leitura boa (mantida numa falha). */
    metrics: hostMetricsSchema.nullable(),
    /** Instante (ISO) da última leitura boa. */
    checkedAt: z.string().nullable(),
    /** Instante (ISO) da última tentativa. */
    attemptedAt: z.string(),
    /** Sem leitura boa há mais que isso, a tela marca "desatualizado". */
    staleAfterMs: z.number(),
})

export type HostUsage = z.infer<typeof hostUsageSchema>
export type HostMetrics = z.infer<typeof hostMetricsSchema>
export type HostMetricsState = z.infer<typeof hostMetricsStateSchema>
export type HostMetricsDto = z.infer<typeof hostMetricsDtoSchema>
export type HostMetricsSource = "plugin" | "shell"
