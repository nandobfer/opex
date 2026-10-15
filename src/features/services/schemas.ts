import { z } from "zod"
import { attachmentIdsSchema } from "@/features/tasks/attachments/schemas"
import { SERVICE_CALC_ORIGINS, SERVICE_SUMMARY_MAX, SERVICE_TITLE_MAX } from "./constants"

/**
 * Contratos do módulo Serviços — os MESMOS usados no formulário e na API. O corpo traz o campo
 * editado (`origin`) e os três valores; o **servidor** recalcula com o fator e o custo/hora atuais
 * do cliente (`computeServiceAmounts`), sem confiar no que veio do navegador.
 */

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Identificador inválido")
/** Data sem hora (`yyyy-MM-dd`), como o `DatePicker` envia. */
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
const hoursValue = z.number({ error: "Informe as horas" }).finite().min(0, "Não pode ser negativo").max(1_000_000, "Valor muito alto")
const money = z.number({ error: "Informe o faturamento" }).finite().min(0, "Não pode ser negativo").max(1_000_000_000, "Valor muito alto")

export const serviceInputSchema = z.object({
    /** Cliente de orçamento (obrigatório). */
    clientId: objectId,
    /** Repositório vinculado (opcional). */
    projectId: objectId.nullable().optional(),
    /** Tarefa de referência (opcional; não copia descrição nem altera a tarefa). */
    taskId: objectId.nullable().optional(),
    description: z.string().trim().min(1, "Informe a descrição").max(50_000, "Texto muito longo"),
    serviceDate: dateOnly,
    /** Campo editado por último (fonte da verdade do cálculo). */
    origin: z.enum(SERVICE_CALC_ORIGINS),
    hours: hoursValue,
    clientHours: hoursValue,
    billingBrl: money,
    /** Título/summary editados manualmente (opcional; sem eles a IA preenche). */
    title: z.string().trim().max(SERVICE_TITLE_MAX, `Máximo de ${SERVICE_TITLE_MAX} caracteres`).nullable().optional(),
    summary: z.string().trim().max(SERVICE_SUMMARY_MAX, `Máximo de ${SERVICE_SUMMARY_MAX} caracteres`).nullable().optional(),
})
export type ServiceInput = z.infer<typeof serviceInputSchema>

/** Criação/edição: o formulário mais os anexos enviados antes de o serviço existir (ou novos na edição). */
export const serviceWriteSchema = serviceInputSchema.extend({ attachmentIds: attachmentIdsSchema })
export type ServiceWriteInput = z.infer<typeof serviceWriteSchema>

/**
 * Formulário do serviço (tela). Os três valores reativos **não** entram aqui: são controlados pelo
 * `ServiceAmountsFields` (que mantém o texto `H:mm`/R$ em edição) e enviados como números no corpo.
 */
export const serviceFormSchema = z.object({
    clientId: z.string().regex(/^[a-f0-9]{24}$/i, "Escolha o cliente"),
    projectId: z.string(),
    taskId: z.string(),
    description: z.string().trim().min(1, "Informe a descrição").max(50_000, "Texto muito longo"),
    serviceDate: dateOnly,
    title: z.string().max(SERVICE_TITLE_MAX, `Máximo de ${SERVICE_TITLE_MAX} caracteres`),
    summary: z.string().max(SERVICE_SUMMARY_MAX, `Máximo de ${SERVICE_SUMMARY_MAX} caracteres`),
})
export type ServiceFormValues = z.infer<typeof serviceFormSchema>
