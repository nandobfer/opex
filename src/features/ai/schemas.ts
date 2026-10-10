import { z } from "zod"
import { AI_PROVIDER_IDS, AI_TEXT_PROVIDER_IDS } from "@/lib/ai/providers"
import { DEFAULT_TASK_TAXONOMY, MAX_TASK_TAGS, MAX_TAXONOMY_TAGS, TASK_TAG_ID_MAX, TASK_TAG_LABEL_MAX } from "@/features/tasks/tags"
import {
    DEFAULT_TASK_SUMMARY_INSTRUCTIONS,
    DEFAULT_TASK_TAGS_INSTRUCTIONS,
    DEFAULT_UNDERSTAND_TASK_INSTRUCTIONS,
    DEFAULT_BUDGET_PREVIEW_INSTRUCTIONS,
    DEFAULT_ESTIMATE_HOURS_INSTRUCTIONS,
    DEFAULT_TASK_REFINEMENT_INSTRUCTIONS,
    TASK_SUMMARY_MAX_LENGTH_DEFAULT,
    TASK_SUMMARY_MAX_LENGTH_MAX,
    TASK_SUMMARY_MAX_LENGTH_MIN,
    UNDERSTAND_TASK_FORMATS,
} from "./constants"

/** Configuração da feature "Entender tarefas" — mesmo schema na tela e na API. */
export const understandTaskSettingsSchema = z
    .object({
        enabled: z.boolean(),
        provider: z.enum(AI_TEXT_PROVIDER_IDS).nullable(),
        model: z.string().trim().max(200).nullable(),
        agent: z.string().trim().max(100).nullable(),
        variant: z.string().trim().max(50).nullable(),
        temperature: z.number({ error: "Informe um número" }).min(0, "Mínimo 0").max(2, "Máximo 2").nullable(),
        maxOutputTokens: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(256, "Mínimo 256").max(65_536, "Máximo 65.536").nullable(),
        responseFormat: z.enum(UNDERSTAND_TASK_FORMATS),
        instructions: z.string().trim().min(1, "Informe as instruções").max(8000, "Até 8.000 caracteres"),
        include: z.object({
            comments: z.boolean(),
            history: z.boolean(),
            timeLogs: z.boolean(),
        }),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.provider) ctx.addIssue({ code: "custom", path: ["provider"], message: "Selecione o provedor" })
        if (!value.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Selecione o modelo" })
    })

export type UnderstandTaskSettings = z.infer<typeof understandTaskSettingsSchema>

export const DEFAULT_UNDERSTAND_TASK_SETTINGS: UnderstandTaskSettings = {
    enabled: false,
    provider: null,
    model: null,
    agent: null,
    variant: null,
    temperature: null,
    maxOutputTokens: null,
    responseFormat: "sections",
    instructions: DEFAULT_UNDERSTAND_TASK_INSTRUCTIONS,
    include: { comments: true, history: true, timeLogs: false },
}

/** Configuração da feature "Resumos de tarefas" — mesmo schema na tela e na API. */
export const taskSummarySettingsSchema = z
    .object({
        enabled: z.boolean(),
        provider: z.enum(AI_TEXT_PROVIDER_IDS).nullable(),
        model: z.string().trim().max(200).nullable(),
        agent: z.string().trim().max(100).nullable(),
        variant: z.string().trim().max(50).nullable(),
        temperature: z.number({ error: "Informe um número" }).min(0, "Mínimo 0").max(2, "Máximo 2").nullable(),
        maxOutputTokens: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(256, "Mínimo 256").max(65_536, "Máximo 65.536").nullable(),
        instructions: z.string().trim().min(1, "Informe as instruções").max(8000, "Até 8.000 caracteres"),
        maxLength: z
            .number({ error: "Informe um número" })
            .int("Use um número inteiro")
            .min(TASK_SUMMARY_MAX_LENGTH_MIN, `Mínimo ${TASK_SUMMARY_MAX_LENGTH_MIN}`)
            .max(TASK_SUMMARY_MAX_LENGTH_MAX, `Máximo ${TASK_SUMMARY_MAX_LENGTH_MAX}`),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.provider) ctx.addIssue({ code: "custom", path: ["provider"], message: "Selecione o provedor" })
        if (!value.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Selecione o modelo" })
    })

export type TaskSummarySettings = z.infer<typeof taskSummarySettingsSchema>

export const DEFAULT_TASK_SUMMARY_SETTINGS: TaskSummarySettings = {
    enabled: false,
    provider: null,
    model: null,
    agent: null,
    variant: null,
    temperature: null,
    maxOutputTokens: null,
    instructions: DEFAULT_TASK_SUMMARY_INSTRUCTIONS,
    maxLength: TASK_SUMMARY_MAX_LENGTH_DEFAULT,
}

/** Configuração da feature "Orçamentos" (prévia/estimativa do portal do cliente). */
export const budgetPreviewSettingsSchema = z
    .object({
        enabled: z.boolean(),
        provider: z.enum(AI_TEXT_PROVIDER_IDS).nullable(),
        model: z.string().trim().max(200).nullable(),
        agent: z.string().trim().max(100).nullable(),
        variant: z.string().trim().max(50).nullable(),
        temperature: z.number({ error: "Informe um número" }).min(0, "Mínimo 0").max(2, "Máximo 2").nullable(),
        maxOutputTokens: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(256, "Mínimo 256").max(65_536, "Máximo 65.536").nullable(),
        instructions: z.string().trim().min(1, "Informe as instruções").max(8000, "Até 8.000 caracteres"),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.provider) ctx.addIssue({ code: "custom", path: ["provider"], message: "Selecione o provedor" })
        if (!value.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Selecione o modelo" })
    })

export type BudgetPreviewSettings = z.infer<typeof budgetPreviewSettingsSchema>

export const DEFAULT_BUDGET_PREVIEW_SETTINGS: BudgetPreviewSettings = {
    enabled: false,
    provider: null,
    model: null,
    agent: null,
    variant: null,
    temperature: null,
    maxOutputTokens: null,
    instructions: DEFAULT_BUDGET_PREVIEW_INSTRUCTIONS,
}

/** Configuração da feature "Estimar prazos" — estima as horas por tarefas semelhantes (texto ou JEV). */
export const estimateHoursSettingsSchema = z
    .object({
        enabled: z.boolean(),
        provider: z.enum(AI_PROVIDER_IDS).nullable(),
        model: z.string().trim().max(200).nullable(),
        agent: z.string().trim().max(100).nullable(),
        variant: z.string().trim().max(50).nullable(),
        temperature: z.number({ error: "Informe um número" }).min(0, "Mínimo 0").max(2, "Máximo 2").nullable(),
        maxOutputTokens: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(256, "Mínimo 256").max(65_536, "Máximo 65.536").nullable(),
        instructions: z.string().trim().min(1, "Informe as instruções").max(8000, "Até 8.000 caracteres"),
        similarLimit: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1, "Mínimo 1").max(20, "Máximo 20"),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.provider) ctx.addIssue({ code: "custom", path: ["provider"], message: "Selecione o provedor" })
        if (!value.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Selecione o modelo" })
    })

export type EstimateHoursSettings = z.infer<typeof estimateHoursSettingsSchema>

export const DEFAULT_ESTIMATE_HOURS_SETTINGS: EstimateHoursSettings = {
    enabled: false,
    provider: null,
    model: null,
    agent: null,
    variant: null,
    temperature: null,
    maxOutputTokens: null,
    instructions: DEFAULT_ESTIMATE_HOURS_INSTRUCTIONS,
    similarLimit: 5,
}

/** Entrada da taxonomia de tags (id estável + rótulo). */
export const taskTagDefSchema = z.object({
    id: z.string().trim().min(1, "Informe o identificador").max(TASK_TAG_ID_MAX, "Identificador muito longo"),
    label: z.string().trim().min(1, "Informe o rótulo").max(TASK_TAG_LABEL_MAX, "Rótulo muito longo"),
})

/**
 * Configuração da feature "Tags de tarefas" — provedor (texto ou JEV), modelo e a **taxonomia
 * fechada** de tags. Com JEV, cada tag vira uma pergunta `noul` e vale o `jevThreshold`.
 */
export const taskTagsSettingsSchema = z
    .object({
        enabled: z.boolean(),
        provider: z.enum(AI_PROVIDER_IDS).nullable(),
        model: z.string().trim().max(200).nullable(),
        agent: z.string().trim().max(100).nullable(),
        variant: z.string().trim().max(50).nullable(),
        temperature: z.number({ error: "Informe um número" }).min(0, "Mínimo 0").max(2, "Máximo 2").nullable(),
        maxOutputTokens: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(256, "Mínimo 256").max(65_536, "Máximo 65.536").nullable(),
        instructions: z.string().trim().min(1, "Informe as instruções").max(8000, "Até 8.000 caracteres"),
        maxTags: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1, "Mínimo 1").max(MAX_TASK_TAGS, `Máximo ${MAX_TASK_TAGS}`),
        jevThreshold: z.number({ error: "Informe um número" }).min(0.05, "Mínimo 0,05").max(0.95, "Máximo 0,95"),
        taxonomy: z.array(taskTagDefSchema).max(MAX_TAXONOMY_TAGS, `Máximo ${MAX_TAXONOMY_TAGS} tags`),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.provider) ctx.addIssue({ code: "custom", path: ["provider"], message: "Selecione o provedor" })
        if (!value.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Selecione o modelo" })
        if (value.taxonomy.length === 0) ctx.addIssue({ code: "custom", path: ["taxonomy"], message: "Adicione ao menos uma tag à taxonomia" })
        const seen = new Set<string>()
        for (const [index, tag] of value.taxonomy.entries()) {
            if (seen.has(tag.id)) ctx.addIssue({ code: "custom", path: ["taxonomy", index, "id"], message: "Identificador repetido" })
            seen.add(tag.id)
        }
    })

export type TaskTagsSettings = z.infer<typeof taskTagsSettingsSchema>

export const DEFAULT_TASK_TAGS_SETTINGS: TaskTagsSettings = {
    enabled: false,
    provider: null,
    model: null,
    agent: null,
    variant: null,
    temperature: null,
    maxOutputTokens: null,
    instructions: DEFAULT_TASK_TAGS_INSTRUCTIONS,
    maxTags: 5,
    jevThreshold: 0.5,
    taxonomy: DEFAULT_TASK_TAXONOMY,
}

/**
 * Configuração da feature "Refinar tarefa" — agente do OpenCode que lê a tarefa, faz perguntas
 * (formulários) e reescreve a especificação técnica até ela ficar clara. Exclusiva do OpenCode
 * (depende de sessão longa e do sistema de perguntas), como "Estimar prazos".
 */
export const taskRefinementSettingsSchema = z
    .object({
        enabled: z.boolean(),
        model: z.string().trim().max(200).nullable(),
        agent: z.string().trim().max(100).nullable(),
        variant: z.string().trim().max(50).nullable(),
        instructions: z.string().trim().min(1, "Informe as instruções").max(8000, "Até 8.000 caracteres"),
        include: z.object({ comments: z.boolean(), history: z.boolean() }),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Selecione o modelo" })
    })

export type TaskRefinementSettings = z.infer<typeof taskRefinementSettingsSchema>

export const DEFAULT_TASK_REFINEMENT_SETTINGS: TaskRefinementSettings = {
    enabled: false,
    model: null,
    agent: "plan",
    variant: null,
    instructions: DEFAULT_TASK_REFINEMENT_INSTRUCTIONS,
    include: { comments: true, history: true },
}
