import { z } from "zod"

/**
 * Contratos da visão Financeiro (faturamento das tarefas concluídas, por cliente). Módulo puro.
 */

export const FINANCE_PATH = "/financeiro"

const isoDate = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Data inválida")

export const financeQuerySchema = z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
})
export type FinanceQuery = z.infer<typeof financeQuerySchema>
