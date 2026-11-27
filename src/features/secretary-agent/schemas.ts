import { z } from "zod"
import { aiProviderIdIn } from "@nandobfer/integracoes/modules/integrations/ia/ai/schemas"
import { OPEX_PROVIDER_IDS } from "@/features/opex-agent/constants"
import { csvList, isoDate, pageQuery } from "@/lib/list/query"
import { SECRETARY_DECISIONS, SECRETARY_DEFAULTS, SECRETARY_MODES } from "./constants"
import { needsPrice, priceKey } from "./cost"

/**
 * Configuração do Agente Secretário (aba Geral + Critérios): o MESMO schema na tela e na API. Só provedores
 * de inferência por API que aceitam ferramentas (`OPEX_PROVIDER_IDS`), nunca o OpenCode de sessão.
 */

const providerSchema = aiProviderIdIn(OPEX_PROVIDER_IDS).nullable()
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

/** Provedores de quem decide o assunto: os de texto do Agente Opex e o JEV (decisão tipada, sem gerar texto). */
export const DECISION_PROVIDER_IDS = [...OPEX_PROVIDER_IDS, "jev"] as const
export type SecretaryDecisionProvider = (typeof DECISION_PROVIDER_IDS)[number]
export const decisionModelSchema = secondaryModelSchema.extend({ provider: z.enum(DECISION_PROVIDER_IDS).nullable() })
export type SecretaryDecisionModel = z.infer<typeof decisionModelSchema>

export const tokenPriceSchema = z.object({
    inputPerMTok: z.number({ error: "Informe o preço" }).min(0, "Mínimo 0").max(1000, "Máximo US$ 1000"),
    outputPerMTok: z.number({ error: "Informe o preço" }).min(0, "Mínimo 0").max(1000, "Máximo US$ 1000"),
})

export const jidSchema = z.string().trim().min(5).max(120).regex(/^[^@\s]+@[a-z.]+$/, "Conversa inválida")

/** Um assunto (bloqueado ou liberado): nome curto, descrição e exemplos. */
export const subjectRuleSchema = z.object({
    id: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/, "Identificador inválido"),
    name: z.string().trim().min(1, "Dê um nome ao assunto").max(60, "Máximo de 60 caracteres"),
    description: z.string().trim().max(1000, "Máximo de 1000 caracteres"),
    examples: z.array(z.string().trim().min(1).max(300, "Máximo de 300 caracteres")).max(20, "Máximo de 20 exemplos"),
})
export type SubjectRule = z.infer<typeof subjectRuleSchema>

/**
 * Critérios (OPE-192, plano v3): duas etapas que precisam passar JUNTAS, sem precedência entre elas.
 * - `audience` ("Quem pode ser respondido"): nunca responder a `blocked`; responder a todos (com os tipos de
 *   conversa) ou só aos `selected`; em grupo, sempre ou só quando mencionam o dono.
 * - `subjects` ("Sobre o quê"): assuntos bloqueados sempre bloqueiam; responder sobre qualquer assunto ou só os liberados.
 */
export const criteriaSchema = z.object({
    audience: z.object({
        mode: z.enum(["everyone", "selected"]),
        selected: z.array(jidSchema).max(2000),
        blocked: z.array(jidSchema).max(2000),
        direct: z.boolean(),
        groups: z.boolean(),
        groupReply: z.enum(["always", "mention"]),
    }),
    subjects: z.object({
        mode: z.enum(["any", "only"]),
        blocked: z.array(subjectRuleSchema).max(20, "Máximo de 20 assuntos"),
        allowed: z.array(subjectRuleSchema).max(20, "Máximo de 20 assuntos"),
    }),
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
    /** Quem decide o assunto: "Mesmo do agente", outro modelo de texto ou o JEV. */
    decision: z.object({ model: decisionModelSchema }),
    criteria: criteriaSchema,
})
export type SecretarySettingsShape = z.infer<typeof baseSettingsSchema>

type ModelRole = "main" | "media" | "analysis" | "decision"

/**
 * Modelos de texto em uso (principal, mídia, análise e decisão do assunto), resolvendo "Mesmo do agente". O JEV fica
 * de fora: tem tarifa fixa e não precisa de preço na tabela.
 */
export function modelsInUse(settings: Pick<SecretarySettingsShape, "main" | "media" | "analysis"> & { decision?: SecretarySettingsShape["decision"] }): { role: ModelRole; provider: string; model: string }[] {
    const out: { role: ModelRole; provider: string; model: string }[] = []
    if (settings.main.provider && settings.main.model) out.push({ role: "main", provider: settings.main.provider, model: settings.main.model })
    const refs: [ModelRole, { sameAsAgent: boolean; provider: string | null; model: string | null } | undefined][] = [["media", settings.media.model], ["analysis", settings.analysis.model], ["decision", settings.decision?.model]]
    for (const [role, ref] of refs) {
        if (ref && !ref.sameAsAgent && ref.provider && ref.provider !== "jev" && ref.model) out.push({ role, provider: ref.provider, model: ref.model })
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
    for (const role of ["media", "analysis", "decision"] as const) {
        const ref = role === "media" ? value.media.model : role === "analysis" ? value.analysis.model : value.decision.model
        if (!ref.sameAsAgent && (!ref.provider || !ref.model)) ctx.addIssue({ code: "custom", path: [role, "model", "model"], message: "Escolha o provedor e o modelo, ou use o mesmo do agente" })
    }
    if (value.criteria.subjects.mode === "only" && value.criteria.subjects.allowed.length === 0) {
        ctx.addIssue({ code: "custom", path: ["criteria", "subjects", "allowed"], message: "Cadastre ao menos um assunto liberado, ou responda sobre qualquer assunto" })
    }
    if (value.criteria.audience.mode === "selected" && value.criteria.audience.selected.length === 0) {
        ctx.addIssue({ code: "custom", path: ["criteria", "audience", "selected"], message: "Escolha ao menos uma conversa, ou responda a todos" })
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
    decision: { model: { sameAsAgent: true, ...emptyModel } },
    criteria: {
        audience: { mode: "everyone", selected: [], blocked: [], direct: true, groups: false, groupReply: "mention" },
        subjects: { mode: "any", blocked: [], allowed: [] },
    },
}

type LegacyRule = { description?: unknown; examples?: unknown }
const legacyFilled = (rule: LegacyRule | undefined) => Boolean(rule && ((typeof rule.description === "string" && rule.description.trim()) || (Array.isArray(rule.examples) && rule.examples.length)))
const legacySubject = (id: string, name: string, rule: LegacyRule): SubjectRule => ({
    id, name,
    description: typeof rule.description === "string" ? rule.description : "",
    examples: Array.isArray(rule.examples) ? rule.examples.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
})
const jids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [])

/**
 * Critérios salvos no formato da v1 (escopo base, exclusões, inclusões, assuntos "sempre"/"nunca") viram o formato
 * novo (puro). `none` vira "Só os escolhidos" com as antigas inclusões; o assunto "sempre" vira um assunto liberado
 * MANTENDO "Qualquer assunto" (o agente não fica mudo de repente). O "sempre puxa quem está fora" deixa de existir.
 */
export function migrateLegacyCriteria(raw: unknown): unknown {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw
    const value = raw as Record<string, unknown>
    if (!("baseScope" in value) && !("exclude" in value) && !("include" in value)) return raw
    const types = (value.chatTypes ?? {}) as { direct?: unknown; groups?: unknown }
    const subjects = (value.subjects ?? {}) as { always?: LegacyRule; never?: LegacyRule }
    const include = jids(value.include)
    const selected = value.baseScope === "none"
    return {
        audience: {
            mode: selected ? "selected" : "everyone",
            selected: selected ? include : [],
            blocked: jids(value.exclude),
            direct: typeof types.direct === "boolean" ? types.direct : true,
            groups: typeof types.groups === "boolean" ? types.groups : false,
            groupReply: value.groupMode === "always" ? "always" : "mention",
        },
        subjects: {
            mode: "any",
            blocked: legacyFilled(subjects.never) ? [legacySubject("assunto-bloqueado", "Assunto bloqueado", subjects.never!)] : [],
            allowed: legacyFilled(subjects.always) ? [legacySubject("assunto-liberado", "Assunto liberado", subjects.always!)] : [],
        },
    }
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
    const criteria = (migrateLegacyCriteria(value.criteria) ?? {}) as Record<string, unknown>
    const section = (key: "audience" | "subjects") => ({ ...DEFAULT_SECRETARY_SETTINGS.criteria[key], ...((criteria[key] as object | undefined) ?? {}) })
    return {
        ...DEFAULT_SECRETARY_SETTINGS,
        ...value,
        main: merge("main"),
        media: merge("media"),
        human: merge("human"),
        limits: merge("limits"),
        analysis: merge("analysis"),
        decision: merge("decision"),
        criteria: { audience: section("audience"), subjects: section("subjects") },
    }
}

/**
 * Simulação (aba Simulação): as configurações em edição (o mesmo schema, sem exigir "ligado" nem instância), a
 * conversa, a mensagem do contato e o que a simulação já acumulou (histórico e memórias gravadas só no navegador).
 */
export const simulateSchema = z.object({
    settings: baseSettingsSchema,
    jid: jidSchema,
    mentionsOwner: z.boolean().default(false),
    history: z.array(z.object({ owner: z.boolean(), text: z.string().max(4000) })).max(60).default([]),
    message: z.string().trim().min(1, "Escreva a mensagem").max(4000, "Máximo de 4000 caracteres"),
    useRealHistory: z.boolean().default(false),
    memories: z.array(z.object({ channel: z.string().max(200), title: z.string().max(200), text: z.string().max(4000) })).max(20).default([]),
})
export type SimulateInput = z.infer<typeof simulateSchema>

/** Ações rápidas da aba Conversas. */
export const conversationActionSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("pause"), minutes: z.number().int().min(1).max(60 * 24 * 30) }),
    z.object({ action: z.literal("resume") }),
    z.object({ action: z.literal("exclude") }),
    z.object({ action: z.literal("include") }),
])
export type ConversationActionInput = z.infer<typeof conversationActionSchema>

/**
 * `GET /api/secretary/decisions` — aba Decisões (OPE-197): conversas e decisões em CSV, período ISO (dia inteiro no
 * fuso do navegador, `dayRangeParams`) e página. `jid` único (contrato antigo) continua aceito.
 */
export const DECISION_PAGE_LIMIT = 50
export const decisionListQuerySchema = z.object({
    jid: csvList.pipe(z.array(jidSchema).max(200)),
    decision: csvList.pipe(z.array(z.enum(SECRETARY_DECISIONS)).max(SECRETARY_DECISIONS.length)),
    from: isoDate.optional(),
    to: isoDate.optional(),
    ...pageQuery(DECISION_PAGE_LIMIT, 100),
})
export type DecisionListQuery = z.infer<typeof decisionListQuerySchema>

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
/** Gravação da base pela tela: leva a versão em que a edição se baseou (409 se a personalidade mudou desde então). */
export const personalitySaveSchema = personalitySchema.extend({ expectedVersionId: z.string().min(1).max(100).nullable().optional() })
export type PersonalitySaveInput = z.infer<typeof personalitySaveSchema>
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
