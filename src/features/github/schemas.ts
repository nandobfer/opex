import { z } from "zod"
import { COLUMN_KEY_PATTERN } from "@/features/tasks/board"
import { TASK_PRIORITIES, TASK_TYPES } from "@/features/tasks/constants"

/** Schemas da integração GitHub (mesmos na tela e na API). Módulo puro. */

export const repoName = z
    .string()
    .trim()
    .regex(/^[\w.-]+\/[\w.-]+$/, "Escolha um repositório")
    .transform((value) => value.toLowerCase())

/** Vínculo repositório ↔ Opex (criar/editar): o repositório é o Projeto. */
export const repoLinkInputSchema = z.object({
    repo: repoName,
    entryColumnKey: z.string({ error: "Escolha a coluna de entrada" }).regex(COLUMN_KEY_PATTERN, "Escolha uma coluna"),
    enabled: z.boolean(),
})
export type RepoLinkInput = z.input<typeof repoLinkInputSchema>
export type RepoLinkValues = z.output<typeof repoLinkInputSchema>

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
