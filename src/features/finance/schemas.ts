import { z } from "zod"

/**
 * Contratos da visão Financeiro (faturamento das tarefas concluídas, por cliente). Módulo puro.
 */

export const FINANCE_PATH = "/financeiro"

const OBJECT_ID = /^[a-f0-9]{24}$/i

const isoDate = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Data inválida")

/** Lista de ids separados por vírgula (`clientIds=a,b`): sem duplicatas; id malformado é recusado. */
const idList = z
    .string()
    .optional()
    .transform((value) => (value ? [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))] : []))
    .refine((ids) => ids.every((id) => OBJECT_ID.test(id)), "Identificador inválido")

export const financeQuerySchema = z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    clientIds: idList,
    projectIds: idList,
})
export type FinanceQuery = z.infer<typeof financeQuerySchema>
