import { z } from "zod"
import { CUSTOM_COLUMN_KEY } from "@/features/tasks/board"
import { TASK_PRIORITIES, TASK_TYPES } from "@/features/tasks/constants"

/** Schemas da integração GitHub (mesmos na tela e na API). Módulo puro. */

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Identificador inválido")
const login = z
    .string()
    .trim()
    .min(1)
    .max(39)
    .regex(/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i, "Login do GitHub inválido")
    .transform((value) => value.toLowerCase())

export const repoName = z
    .string()
    .trim()
    .regex(/^[\w.-]+\/[\w.-]+$/, "Escolha um repositório")
    .transform((value) => value.toLowerCase())

/** Vínculo repositório ↔ produto (criar/editar). */
export const repoLinkInputSchema = z.object({
    repo: repoName,
    productId: objectId,
    productName: z.string().trim().min(1).max(160),
    authors: z.array(login).min(1, "Escolha ao menos um autor").max(50, "No máximo 50 autores"),
    entryColumnKey: z.string({ error: "Escolha a coluna de entrada" }).regex(CUSTOM_COLUMN_KEY, "Escolha uma coluna pessoal"),
    defaultType: z.enum(TASK_TYPES),
    defaultPriority: z.enum(TASK_PRIORITIES),
    enabled: z.boolean(),
})
export type RepoLinkInput = z.input<typeof repoLinkInputSchema>
export type RepoLinkValues = z.output<typeof repoLinkInputSchema>

export const removeLinkSchema = z.object({ drafts: z.enum(["keep", "discard"]) })

export const typeRuleSchema = z.object({
    kind: z.enum(["type", "label"]),
    value: z.string().trim().min(1, "Informe o valor").max(80),
    taskType: z.enum(TASK_TYPES),
})
export type GithubTypeRule = z.infer<typeof typeRuleSchema>

export const priorityRuleSchema = z.object({
    label: z.string().trim().min(1, "Informe a label").max(80),
    priority: z.enum(TASK_PRIORITIES),
})
export type GithubPriorityRule = z.infer<typeof priorityRuleSchema>

export const mappingInputSchema = z.object({
    typeRules: z.array(typeRuleSchema).max(100),
    priorityRules: z.array(priorityRuleSchema).max(100),
})
export type MappingInput = z.infer<typeof mappingInputSchema>

/** Pessoa: login do GitHub → desenvolvedor do Go! Sipal (`null` desfaz). */
export const personMappingSchema = z.object({
    developerId: objectId.nullable(),
    developerName: z.string().trim().max(120).nullable().optional(),
})

export const acceptSuggestionsSchema = z.object({ logins: z.array(login).min(1).max(500) })

/** Campos que o usuário pode editar no rascunho (o que for editado não é sobrescrito pela issue). */
export const DRAFT_FIELDS = ["title", "body", "taskType", "priority", "assignee", "workPackage"] as const
export type DraftField = (typeof DRAFT_FIELDS)[number]

const assigneeRef = z.object({ id: objectId, name: z.string().max(120), email: z.string().max(200).nullable() }).nullable().optional()
const workPackageRef = z.object({ id: objectId, name: z.string().max(160) }).nullable().optional()

export const updateDraftSchema = z
    .object({
        title: z.string().trim().min(1, "Informe o título").max(300).optional(),
        body: z.string().max(60_000).optional(),
        taskType: z.enum(TASK_TYPES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        assignee: assigneeRef,
        workPackage: workPackageRef,
        /** Volta estes campos para o valor vindo da issue. */
        restore: z.array(z.enum(DRAFT_FIELDS)).max(DRAFT_FIELDS.length).optional(),
    })
    .refine((value) => Object.values(value).some((item) => item !== undefined), "Nada para alterar")
export type UpdateDraftInput = z.input<typeof updateDraftSchema>

/** Rascunho só nasce em colunas aceitas pela criação do Go! Sipal. */
export const CREATABLE_TASK_STATUSES = ["backlog", "prioritized", "specification", "development"] as const
export type CreatableTaskStatus = (typeof CREATABLE_TASK_STATUSES)[number]

export const sendDraftSchema = z.object({
    status: z.enum(CREATABLE_TASK_STATUSES),
    taskType: z.enum(TASK_TYPES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    assignee: assigneeRef,
    workPackage: workPackageRef,
})
export type SendDraftInput = z.input<typeof sendDraftSchema>
