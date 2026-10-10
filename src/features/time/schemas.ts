import { z } from "zod"

/**
 * Contratos do controle de horas **agêntico** (o Opex é a fonte de verdade). Os apontamentos são
 * criados/fechados **somente pelo servidor**, a partir da mesa de trabalho; a interação humana é
 * somente leitura. Módulo puro.
 */

export const TIME_UPDATED_EVENT = "time-updated"
export const TIME_PATH = "/tarefas/horas"

const isoDate = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Data inválida")

export const timeLogsQuerySchema = z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
})
export type TimeLogsQuery = z.infer<typeof timeLogsQuerySchema>
