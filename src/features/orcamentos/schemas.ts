import { z } from "zod"
import { TASK_PRIORITIES, TASK_TYPES } from "@/features/tasks/constants"
import { PREVIEW_CLARITY_STATUSES, type PreviewClarityDto } from "./clarity"

/** Schemas do módulo Orçamentos — os MESMOS usados na tela, na API e no portal. */

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Identificador inválido")

/** Cliente do portal (criar/editar). */
export const clienteOrcamentoSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome").max(120, "Máximo de 120 caracteres"),
    projectIds: z.array(objectId).min(1, "Selecione ao menos um repositório"),
    hourlyRate: z
        .number({ error: "Informe o custo por hora" })
        .min(0, "Não pode ser negativo")
        .max(1_000_000, "Valor muito alto"),
    profitFactor: z
        .number({ error: "Informe o fator de lucro" })
        .min(1, "Mínimo 1")
        .max(100, "Máximo 100"),
    active: z.boolean(),
})
export type ClienteOrcamentoInput = z.infer<typeof clienteOrcamentoSchema>

/** Rascunho criado pelo portal: repositório + descrição. */
export const clienteDraftSchema = z.object({
    projectId: objectId,
    description: z.string().trim().min(1, "Descreva a tarefa").max(50_000, "Texto muito longo"),
})
export type ClienteDraftInput = z.infer<typeof clienteDraftSchema>

/** Correção pedida pelo cliente sobre a prévia. */
export const clienteCorrectionSchema = z.object({
    correction: z.string().trim().min(1, "Descreva a correção").max(4000, "Máximo de 4.000 caracteres"),
})
export type ClienteCorrectionInput = z.infer<typeof clienteCorrectionSchema>

/** Comentário do cliente numa tarefa do portal. */
export const clienteCommentSchema = z.object({
    content: z.string().trim().min(1, "Escreva um comentário").max(5000, "Máximo de 5000 caracteres"),
})
export type ClienteCommentInput = z.infer<typeof clienteCommentSchema>

/** Prioridade editada pelo cliente numa tarefa já existente (lista e página do portal). */
export const clienteTaskPrioritySchema = z.object({ priority: z.enum(TASK_PRIORITIES) })
export type ClienteTaskPriorityInput = z.infer<typeof clienteTaskPrioritySchema>

/**
 * Aprovação da prévia: a prioridade escolhida na revisão **sobrepõe** a sugestão da IA. Sem ela, vale
 * a prioridade gerada na prévia.
 */
export const clienteApproveSchema = z.object({ priority: z.enum(TASK_PRIORITIES).optional() })
export type ClienteApproveInput = z.infer<typeof clienteApproveSchema>

/** Dimensão da clareza (critérios de aceite ou localização) devolvida pela IA. */
const previewClarityDimensionSchema = z.object({
    status: z.enum(PREVIEW_CLARITY_STATUSES).catch("vague"),
    detail: z
        .string()
        .trim()
        .max(400)
        .nullish()
        .transform((value) => value ?? null),
})

/** Fallback tolerante: sem clareza confiável, cai em "vague" (não bloqueia a submissão). */
const VAGUE_CLARITY: PreviewClarityDto = {
    acceptanceCriteria: { status: "vague", detail: null },
    location: { status: "vague", detail: null },
}

/**
 * Prévia estruturada devolvida pela IA (validada antes de qualquer uso; sem as horas).
 * `clarity` é **transitória** (avaliação de critérios de aceite e localização): trafega no stream
 * da geração e **não** é gravada no rascunho.
 */
export const draftPreviewSchema = z.object({
    title: z.string().trim().min(1, "Título vazio").max(200),
    taskType: z.enum(TASK_TYPES).nullable(),
    priority: z.enum(TASK_PRIORITIES),
    technicalSpec: z.string().trim().max(50_000),
    summary: z.string().trim().max(400),
    clarity: z
        .object({ acceptanceCriteria: previewClarityDimensionSchema, location: previewClarityDimensionSchema })
        .catch(VAGUE_CLARITY)
        .optional(),
})
export type DraftPreview = z.infer<typeof draftPreviewSchema>

/** Estimativa de horas devolvida pela IA na segunda fase (validada antes de qualquer uso). */
export const draftEstimateSchema = z.object({
    estimatedHours: z.number().min(0).max(10_000),
})
export type DraftEstimate = z.infer<typeof draftEstimateSchema>
