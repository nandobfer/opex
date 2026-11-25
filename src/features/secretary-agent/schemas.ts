import { z } from "zod"
import { OPEX_PROVIDER_IDS } from "@/features/opex-agent/constants"
import { SECRETARY_DEFAULTS, SECRETARY_MODES } from "./constants"
import { needsPrice, priceKey } from "./cost"

/**
 * Configuração do Agente Secretário (aba Geral + Critérios): o MESMO schema na tela e na API. Só provedores
 * de inferência por API que aceitam ferramentas (`OPEX_PROVIDER_IDS`), nunca o OpenCode de sessão.
 */

const providerSchema = z.enum(OPEX_PROVIDER_IDS).nullable()
const nullableText = z.string().trim().nullable()

export const mainModelSchema = z.object({
    provider: providerSchema,
    model: nullableText,
    agent: z.string().nullable(),
    variant: nullableText,
    temperature: z.number().min(0, "Mínimo 0").max(2, "Máximo 2").nullable(),
})
export type SecretaryMainModel = z.infer<typeof mainModelSchema>

/** Modelo secundário (mídia, análise): "Mesmo do agente" ou outro provedor/modelo. */
export const secondaryModelSchema = z.object({
    sameAsAgent: z.boolean(),
    provider: providerSchema,
    model: nullableText,
    agent: z.string().nullable(),
    variant: nullableText,
})
export type SecretarySecondaryModel = z.infer<typeof secondaryModelSchema>

export const tokenPriceSchema = z.object({
    inputPerMTok: z.number({ error: "Informe o preço" }).min(0, "Mínimo 0").max(1000, "Máximo US$ 1000"),
    outputPerMTok: z.number({ error: "Informe o preço" }).min(0, "Mínimo 0").max(1000, "Máximo US$ 1000"),
})

const jidSchema = z.string().trim().min(5).max(120).regex(/^[^@\s]+@[a-z.]+$/, "Conversa inválida")

export const subjectRuleSchema = z.object({
    description: z.string().trim().max(1000, "Máximo de 1000 caracteres"),
    examples: z.array(z.string().trim().min(1).max(300, "Máximo de 300 caracteres")).max(20, "Máximo de 20 exemplos"),
})
export type SubjectRule = z.infer<typeof subjectRuleSchema>

export const criteriaSchema = z.object({
    baseScope: z.enum(["all", "none"]),
    exclude: z.array(jidSchema).max(2000),
    include: z.array(jidSchema).max(2000),
    chatTypes: z.object({ direct: z.boolean(), groups: z.boolean() }),
    groupMode: z.enum(["always", "mention"]),
    subjects: z.object({ always: subjectRuleSchema, never: subjectRuleSchema }),
})
export type SecretaryCriteria = z.infer<typeof criteriaSchema>

const baseSettingsSchema = z.object({
    enabled: z.boolean(),
    main: mainModelSchema,
    instance: nullableText,
    mode: z.enum(SECRETARY_MODES),
    media: z.object({ readImages: z.boolean(), transcribeAudio: z.boolean(), model: secondaryModelSchema }),
    human: z.object({
        groupingSeconds: z.number().int("Use um número inteiro").min(0, "Mínimo 0 s").max(120, "Máximo 120 s"),
        delayMinSeconds: z.number().int("Use um número inteiro").min(0, "Mínimo 0 s").max(120, "Máximo 120 s"),
        delayMaxSeconds: z.number().int("Use um número inteiro").min(0, "Mínimo 0 s").max(180, "Máximo 180 s"),
        typing: z.boolean(),
        splitMessages: z.boolean(),
        markRead: z.boolean(),
    }),
    pauseMinutes: z.number().int("Use um número inteiro").min(1, "Mínimo 1 min").max(1440, "Máximo 1440 min"),
    limits: z.object({
        repliesPerHour: z.number().int("Use um número inteiro").min(1, "Mínimo 1").max(200, "Máximo 200"),
        dailyBudgetUsd: z.number().min(0.01, "Mínimo US$ 0,01").max(1000, "Máximo US$ 1000"),
    }),
    pricing: z.record(z.string(), tokenPriceSchema),
    analysis: z.object({ model: secondaryModelSchema }),
    criteria: criteriaSchema,
})
export type SecretarySettingsShape = z.infer<typeof baseSettingsSchema>

/** Modelos em uso (principal, mídia e análise), resolvendo "Mesmo do agente". */
export function modelsInUse(settings: Pick<SecretarySettingsShape, "main" | "media" | "analysis">): { role: "main" | "media" | "analysis"; provider: string; model: string }[] {
    const out: { role: "main" | "media" | "analysis"; provider: string; model: string }[] = []
    if (settings.main.provider && settings.main.model) out.push({ role: "main", provider: settings.main.provider, model: settings.main.model })
    for (const role of ["media", "analysis"] as const) {
        const ref = role === "media" ? settings.media.model : settings.analysis.model
        if (!ref.sameAsAgent && ref.provider && ref.model) out.push({ role, provider: ref.provider, model: ref.model })
    }
    return out
}

export const secretarySettingsSchema = baseSettingsSchema.superRefine((value, ctx) => {
    if (value.enabled) {
        if (!value.main.provider) ctx.addIssue({ code: "custom", path: ["main", "provider"], message: "Escolha o provedor para ligar o agente" })
        if (!value.main.model) ctx.addIssue({ code: "custom", path: ["main", "model"], message: "Escolha o modelo para ligar o agente" })
        if (!value.instance) ctx.addIssue({ code: "custom", path: ["instance"], message: "Escolha a instância do WhatsApp" })
    }
    if (value.human.delayMaxSeconds < value.human.delayMinSeconds) ctx.addIssue({ code: "custom", path: ["human", "delayMaxSeconds"], message: "O máximo não pode ser menor que o mínimo" })
    for (const role of ["media", "analysis"] as const) {
        const ref = role === "media" ? value.media.model : value.analysis.model
        if (!ref.sameAsAgent && (!ref.provider || !ref.model)) ctx.addIssue({ code: "custom", path: [role, "model", "model"], message: "Escolha o provedor e o modelo, ou use o mesmo do agente" })
    }
    if (value.enabled) {
        for (const item of modelsInUse(value)) {
            if (needsPrice(item.provider) && !value.pricing[priceKey(item.provider, item.model)]) {
                ctx.addIssue({ code: "custom", path: ["pricing"], message: `Informe o preço de ${item.model} (o provedor não informa o custo; o orçamento usa a estimativa)` })
            }
        }
    }
})
export type SecretarySettings = z.infer<typeof secretarySettingsSchema>

const emptyModel = { provider: null, model: null, agent: null, variant: null }

export const DEFAULT_SECRETARY_SETTINGS: SecretarySettings = {
    enabled: false,
    main: { ...emptyModel, temperature: null },
    instance: null,
    mode: "reply",
    media: { readImages: true, transcribeAudio: true, model: { sameAsAgent: true, ...emptyModel } },
    human: { groupingSeconds: SECRETARY_DEFAULTS.groupingSeconds, delayMinSeconds: SECRETARY_DEFAULTS.delayMinSeconds, delayMaxSeconds: SECRETARY_DEFAULTS.delayMaxSeconds, typing: true, splitMessages: true, markRead: true },
    pauseMinutes: SECRETARY_DEFAULTS.pauseMinutes,
    limits: { repliesPerHour: SECRETARY_DEFAULTS.repliesPerHour, dailyBudgetUsd: SECRETARY_DEFAULTS.dailyBudgetUsd },
    pricing: {},
    analysis: { model: { sameAsAgent: true, ...emptyModel } },
    criteria: {
        baseScope: "none",
        exclude: [],
        include: [],
        chatTypes: { direct: true, groups: false },
        groupMode: "mention",
        subjects: { always: { description: "", examples: [] }, never: { description: "", examples: [] } },
    },
}

/** Configuração salva antes de um campo novo existir recebe o padrão dele (mescla rasa por seção). */
export function withSecretaryDefaults(saved: unknown): unknown {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return saved
    const value = saved as Record<string, unknown>
    const merge = (key: keyof SecretarySettings) => {
        const base = DEFAULT_SECRETARY_SETTINGS[key]
        const current = value[key]
        return base && typeof base === "object" && !Array.isArray(base) && current && typeof current === "object" ? { ...base, ...current } : (current ?? base)
    }
    const criteria = merge("criteria") as Record<string, unknown>
    return {
        ...DEFAULT_SECRETARY_SETTINGS,
        ...value,
        main: merge("main"),
        media: merge("media"),
        human: merge("human"),
        limits: merge("limits"),
        analysis: merge("analysis"),
        criteria: { ...criteria, chatTypes: { ...DEFAULT_SECRETARY_SETTINGS.criteria.chatTypes, ...((criteria.chatTypes as object) ?? {}) }, subjects: { ...DEFAULT_SECRETARY_SETTINGS.criteria.subjects, ...((criteria.subjects as object) ?? {}) } },
    }
}

/** Testar critérios (aba Critérios): conversa + mensagem digitada. */
export const criteriaTestSchema = z.object({
    jid: jidSchema,
    text: z.string().trim().min(1, "Digite a mensagem").max(4000, "Máximo de 4000 caracteres"),
    mentioned: z.boolean().optional(),
    /** Critérios em edição (testa antes de salvar); ausente = os salvos. */
    criteria: criteriaSchema.optional(),
})
export type CriteriaTestInput = z.infer<typeof criteriaTestSchema>

/** Ações rápidas da aba Conversas. */
export const conversationActionSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("pause"), minutes: z.number().int().min(1).max(60 * 24 * 30) }),
    z.object({ action: z.literal("resume") }),
    z.object({ action: z.literal("exclude") }),
    z.object({ action: z.literal("include") }),
])
export type ConversationActionInput = z.infer<typeof conversationActionSchema>

/** Resposta do dono a uma pergunta pela aba Avisos. */
export const noticeAnswerSchema = z.object({ answer: z.string().trim().min(1, "Escreva a resposta").max(4000, "Máximo de 4000 caracteres") })
export const noticeActionSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("answer"), answer: noticeAnswerSchema.shape.answer }),
    z.object({ action: z.literal("discard") }),
])
export type NoticeActionInput = z.infer<typeof noticeActionSchema>

/** Personalidade: blocos e variantes. */
export const personalityBlockSchema = z.object({
    key: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/, "Chave inválida"),
    title: z.string().trim().min(1, "Dê um título ao bloco").max(80, "Máximo de 80 caracteres"),
    content: z.string().max(8000, "Máximo de 8000 caracteres"),
})
export type PersonalityBlockInput = z.infer<typeof personalityBlockSchema>

export const personalitySchema = z.object({ blocks: z.array(personalityBlockSchema).min(1).max(40) })
export type PersonalityInput = z.infer<typeof personalitySchema>

export const variantSchema = z.object({
    jid: jidSchema,
    title: z.string().trim().min(1, "Dê um nome à variante").max(80, "Máximo de 80 caracteres"),
    blocks: z.array(personalityBlockSchema).max(40),
})
export type VariantInput = z.infer<typeof variantSchema>

/** Analisar minhas conversas: todas ou as escolhidas, e o período. */
export const analysisStartSchema = z.object({
    scope: z.enum(["all", "selected"]),
    jids: z.array(jidSchema).max(2000),
    months: z.number().int().min(1, "Mínimo 1 mês").max(60, "Máximo 60 meses").nullable(),
}).refine((value) => value.scope === "all" || value.jids.length > 0, { path: ["jids"], message: "Escolha ao menos uma conversa" })
export type AnalysisStartInput = z.infer<typeof analysisStartSchema>
