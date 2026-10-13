import { z } from "zod"
import { TASK_PRIORITIES, TASK_TYPES } from "@/features/tasks/constants"
import { attachmentIdsSchema } from "@/features/tasks/attachments/schemas"
import { PREVIEW_CLARITY_STATUSES, type PreviewClarityDto } from "./clarity"
import { USERNAME_PATTERN } from "./logic"

/** Schemas do módulo Orçamentos — os MESMOS usados na tela, na API e no portal. */

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Identificador inválido")

/**
 * Cliente do portal (criar/editar). Os **repositórios são opcionais**: o cliente pode ser cadastrado
 * e configurado antes de o dono ter acesso aos seus repositórios; sem vínculo, o portal apenas não
 * mostra tarefas. Os escolhidos continuam validados contra o catálogo (existem e são ObjectId).
 */
export const clienteOrcamentoSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome").max(120, "Máximo de 120 caracteres"),
    projectIds: z.array(objectId),
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

/** Rascunho criado pelo portal: repositório + descrição (+ anexos enviados no formulário). */
export const clienteDraftSchema = z.object({
    projectId: objectId,
    description: z.string().trim().min(1, "Descreva a tarefa").max(50_000, "Texto muito longo"),
})
export type ClienteDraftInput = z.infer<typeof clienteDraftSchema>

/**
 * Corpo da abertura do rascunho (portal e prévia do dono): o formulário mais os anexos enviados
 * antes de o rascunho existir. Os arquivos entram **fora** do JSON do formulário (o upload é
 * separado); aqui vão só os ids.
 */
export const createDraftSchema = clienteDraftSchema.extend({ attachmentIds: attachmentIdsSchema })
export type CreateDraftInput = z.infer<typeof createDraftSchema>

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

/**
 * Estimativa da prévia do **dono** (`/tarefas/previa`): o cliente é **opcional** e só define o custo
 * (`H × fator × custo/hora`). Ausente = mantém o cliente já escolhido; `null` = remove (o custo volta
 * a `null`, só com as horas reais). A troca **não** refaz a IA: recalcula apenas o custo.
 */
export const ownerDraftEstimateSchema = z.object({ clientId: objectId.nullable().optional() })
export type OwnerDraftEstimateInput = z.infer<typeof ownerDraftEstimateSchema>

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

/**
 * Usuário de cliente (criar/editar). `email` e `password` são opcionais (o usuário padrão começa sem
 * os dois, entrando só por URL). Senha **sem regra mínima**; na edição, vazio = manter a atual.
 */
export const clienteUserSchema = z.object({
    username: z.string().trim().regex(USERNAME_PATTERN, "3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado"),
    email: z.union([z.string().trim().email("Email inválido").max(200), z.literal("")]).optional(),
    password: z.string().max(200, "Máximo de 200 caracteres").optional(),
    admin: z.boolean(),
})
export type ClienteUserInput = z.infer<typeof clienteUserSchema>

/** Entrada do portal: seleção do cliente na sessão. */
export const clienteSelectSchema = z.object({ clientId: objectId })
export type ClienteSelectInput = z.infer<typeof clienteSelectSchema>

const isoDate = z.string().trim().min(1).refine((value) => !Number.isNaN(new Date(value).getTime()), "Data inválida")

/** Fuso IANA do navegador (ex.: `America/Sao_Paulo`); ausente → o servidor usa UTC. */
const ianaTimeZone = z.string().refine((value) => {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value })
        return true
    } catch {
        return false
    }
}, "Fuso horário inválido")

const projectIdList = z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? [...new Set(value.split(",").map((id) => id.trim()).filter((id) => objectId.safeParse(id).success))] : []))

/** Período do dashboard do portal (ISO opcional) e o fuso do navegador. */
export const clientePeriodQuerySchema = z.object({ from: isoDate.optional(), to: isoDate.optional(), timeZone: ianaTimeZone.optional() })
export type ClientePeriodQuery = z.infer<typeof clientePeriodQuerySchema>

/** Financeiro do cliente: período + filtro opcional de repositórios (ids por vírgula). */
export const clienteFinanceQuerySchema = z.object({ from: isoDate.optional(), to: isoDate.optional(), projectIds: projectIdList })
export type ClienteFinanceQuery = z.infer<typeof clienteFinanceQuerySchema>
