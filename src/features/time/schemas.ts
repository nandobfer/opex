import { z } from "zod"

/**
 * Contratos do controle de horas (mesmas regras de `lib/services/timeTrackingService.ts` e
 * `flows/time/[id]/flow.ts` do Go! Sipal: nada no futuro, fim depois do início, justificativa para
 * mudar horários ou excluir). Módulo puro.
 */

export const TIME_UPDATED_EVENT = "time-updated"
export const TIME_PATH = "/tarefas/horas"

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Identificador inválido")
const isoDate = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Data inválida")
const description = z.string().trim().max(2000, "Máximo de 2000 caracteres")
const justification = z.string().trim().min(3, "Informe a justificativa").max(500, "Máximo de 500 caracteres")

/** Tolerância para relógios levemente adiantados (ms). */
const FUTURE_TOLERANCE_MS = 60_000
const notFuture = (value: string) => new Date(value).getTime() <= Date.now() + FUTURE_TOLERANCE_MS

export const startTimerSchema = z.object({ taskId: objectId })
export type StartTimerInput = z.infer<typeof startTimerSchema>

export const stopTimerSchema = z
    .object({
        description: description.optional(),
        startTime: isoDate.optional(),
        endTime: isoDate.optional(),
        taskCode: z.string().max(40).optional(),
    })
    .superRefine((value, ctx) => {
        if (value.startTime && !notFuture(value.startTime)) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Início não pode ser no futuro" })
        if (value.endTime && !notFuture(value.endTime)) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Fim não pode ser no futuro" })
        if (value.startTime && value.endTime && new Date(value.endTime) <= new Date(value.startTime)) {
            ctx.addIssue({ code: "custom", path: ["endTime"], message: "Fim deve ser depois do início" })
        }
    })
export type StopTimerInput = z.infer<typeof stopTimerSchema>

/** Editar apontamento: só a descrição, ou o período (com justificativa). */
export const updateTimeLogSchema = z.union([
    z.object({ kind: z.literal("description"), description }),
    z
        .object({ kind: z.literal("period"), startTime: isoDate, endTime: isoDate, justification })
        .superRefine((value, ctx) => {
            if (!notFuture(value.startTime)) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Início não pode ser no futuro" })
            if (!notFuture(value.endTime)) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Fim não pode ser no futuro" })
            if (new Date(value.endTime) <= new Date(value.startTime)) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Fim deve ser depois do início" })
        }),
])
export type UpdateTimeLogInput = z.infer<typeof updateTimeLogSchema>

export const deleteTimeLogSchema = z.object({ justification })

export const timeLogsQuerySchema = z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
})

// ── Formulários (datetime-local no fuso do navegador) ───────────────────────────────────────

const localDateTime = z.string().min(1, "Informe a data e a hora")

/** Modal "Parar timer". */
export const stopTimerFormSchema = z
    .object({ adjust: z.boolean(), startTime: z.string(), endTime: z.string(), description })
    .superRefine((value, ctx) => {
        if (!value.adjust) return
        const start = new Date(value.startTime)
        const end = new Date(value.endTime)
        if (!value.startTime || Number.isNaN(start.getTime())) return ctx.addIssue({ code: "custom", path: ["startTime"], message: "Informe o início" })
        if (!value.endTime || Number.isNaN(end.getTime())) return ctx.addIssue({ code: "custom", path: ["endTime"], message: "Informe o fim" })
        if (start.getTime() > Date.now() + FUTURE_TOLERANCE_MS) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Início não pode ser no futuro" })
        if (end.getTime() > Date.now() + FUTURE_TOLERANCE_MS) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Fim não pode ser no futuro" })
        if (end <= start) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Fim deve ser depois do início" })
    })
export type StopTimerForm = z.infer<typeof stopTimerFormSchema>

/** Diálogo "Editar período". */
export const editPeriodFormSchema = z
    .object({ startTime: localDateTime, endTime: localDateTime, justification })
    .superRefine((value, ctx) => {
        const start = new Date(value.startTime)
        const end = new Date(value.endTime)
        if (start.getTime() > Date.now() + FUTURE_TOLERANCE_MS) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Início não pode ser no futuro" })
        if (end.getTime() > Date.now() + FUTURE_TOLERANCE_MS) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Fim não pode ser no futuro" })
        if (end <= start) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Fim deve ser depois do início" })
    })
export type EditPeriodForm = z.infer<typeof editPeriodFormSchema>

export const justificationFormSchema = z.object({ justification })
