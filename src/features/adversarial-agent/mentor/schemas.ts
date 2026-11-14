import { z } from "zod"
import { csvList, isoDate, objectIdCsv, pageQuery } from "@/lib/list/query"
import { AI_PROVIDER_IDS, AI_TEXT_PROVIDER_IDS } from "@/lib/ai/providers"
import { MEMORY_TEXT_MAX } from "@/features/ai/memory-text"
import {
    DEFAULT_MENTOR_WRITER_INSTRUCTIONS,
    MENTOR_BUDGET_DEFAULT,
    MENTOR_BUDGET_MAX,
    MENTOR_BUDGET_MIN,
    MENTOR_COMPACT_DEFAULT,
    MENTOR_COMPACT_MAX,
    MENTOR_COMPACT_MIN,
    MENTOR_DIGEST_TIMEOUT_DEFAULT,
    MENTOR_DIGEST_TIMEOUT_MAX,
    MENTOR_DIGEST_TIMEOUT_MIN,
    MENTOR_LEVELS,
    MENTOR_PAGE_LIMIT,
    MENTOR_PAGE_LIMIT_MAX,
    MENTOR_RUN_STATUSES,
    MENTOR_SOURCES,
    MENTOR_TARGETS,
    MENTOR_TIMEOUT_DEFAULT,
    MENTOR_TIMEOUT_MAX,
    MENTOR_TIMEOUT_MIN,
    MENTOR_USER_TRIGGERS,
    type MentorTarget,
} from "./constants"

const flags = <K extends string>(keys: readonly K[]) => z.object(Object.fromEntries(keys.map((key) => [key, z.boolean()])) as Record<K, z.ZodBoolean>)

const modelFields = {
    model: z.string().trim().max(200).nullable(),
    variant: z.string().trim().max(50).nullable(),
}

/**
 * Configuração do Agente Mentor — mesmo schema na tela e na API. Desde a OPE-165 ele aprende só na
 * conclusão da mesa (`learnOnDone`), a partir da transcrição inteira: o digestor extrai os casos e o funil
 * (decisor → Triador → redator → sanitizador) aplica as operações sem aprovação. Os campos antigos
 * (`triggers`, `context`, `saveMode`) são descartados na leitura (`withMentorDefaults`).
 */
export const mentorSettingsSchema = z
    .object({
        enabled: z.boolean(),
        /** Aprender ao concluir a mesa (o desenvolvedor da central fica somente leitura). */
        learnOnDone: z.boolean(),
        scope: z.object({
            all: z.boolean(),
            centralIds: z.array(z.string().trim().min(1).max(40)).max(200),
        }),
        /** Digestor: lê a transcrição e extrai os casos (modelo barato de contexto longo). */
        digest: z.object({
            provider: z.enum(AI_TEXT_PROVIDER_IDS).nullable(),
            ...modelFields,
            budgetUsd: z.number({ error: "Informe um valor" }).min(MENTOR_BUDGET_MIN, `Mínimo US$ ${MENTOR_BUDGET_MIN}`).max(MENTOR_BUDGET_MAX, `Máximo US$ ${MENTOR_BUDGET_MAX}`),
            compactThresholdChars: z
                .number({ error: "Informe um número" })
                .int("Use um número inteiro")
                .min(MENTOR_COMPACT_MIN, `Mínimo ${MENTOR_COMPACT_MIN.toLocaleString("pt-BR")}`)
                .max(MENTOR_COMPACT_MAX, `Máximo ${MENTOR_COMPACT_MAX.toLocaleString("pt-BR")}`),
            timeoutSeconds: z
                .number({ error: "Informe um número" })
                .int("Use um número inteiro")
                .min(MENTOR_DIGEST_TIMEOUT_MIN, `Mínimo ${MENTOR_DIGEST_TIMEOUT_MIN}`)
                .max(MENTOR_DIGEST_TIMEOUT_MAX, `Máximo ${MENTOR_DIGEST_TIMEOUT_MAX}`),
        }),
        /** Decide se vale gravar: JEV (pergunta `noul`) ou qualquer provedor de texto (JSON com a nota). */
        decider: z.object({ provider: z.enum(AI_PROVIDER_IDS).nullable(), ...modelFields }),
        level: z.enum(MENTOR_LEVELS),
        /** Triador (OPE-97): escolhe a lista de destino de cada caso — JEV (pergunta `choice`) ou qualquer provedor de texto. */
        router: z.object({
            provider: z.enum(AI_PROVIDER_IDS).nullable(),
            ...modelFields,
            instructions: z.string().trim().max(8000, "Até 8.000 caracteres"),
        }),
        /** Listas em que o Mentor pode gravar (ao menos uma). */
        targets: flags(MENTOR_TARGETS),
        /** Escreve as operações de cada caso: criar, atualizar, fundir ou arquivar. */
        writer: z.object({
            provider: z.enum(AI_TEXT_PROVIDER_IDS).nullable(),
            ...modelFields,
            instructions: z.string().trim().max(8000, "Até 8.000 caracteres"),
        }),
        timeoutSeconds: z
            .number({ error: "Informe um número" })
            .int("Use um número inteiro")
            .min(MENTOR_TIMEOUT_MIN, `Mínimo ${MENTOR_TIMEOUT_MIN}`)
            .max(MENTOR_TIMEOUT_MAX, `Máximo ${MENTOR_TIMEOUT_MAX}`),
    })
    .superRefine((value, ctx) => {
        if (value.digest.provider && !value.digest.model) ctx.addIssue({ code: "custom", path: ["digest", "model"], message: "Selecione o modelo" })
        if (value.decider.provider && !value.decider.model) ctx.addIssue({ code: "custom", path: ["decider", "model"], message: "Selecione o modelo" })
        if (value.writer.provider && !value.writer.model) ctx.addIssue({ code: "custom", path: ["writer", "model"], message: "Selecione o modelo" })
        if (value.router.provider && !value.router.model) ctx.addIssue({ code: "custom", path: ["router", "model"], message: "Selecione o modelo" })
        const targets = enabledTargets(value.targets)
        if (!targets.length) ctx.addIssue({ code: "custom", path: ["targets"], message: "Escolha ao menos um destino" })
        if (!value.enabled) return
        if (!value.digest.provider) ctx.addIssue({ code: "custom", path: ["digest", "provider"], message: "Escolha o provedor do digestor" })
        if (targets.length > 1 && !value.router.provider) ctx.addIssue({ code: "custom", path: ["router", "provider"], message: "Escolha o provedor do Triador" })
        if (!value.decider.provider) ctx.addIssue({ code: "custom", path: ["decider", "provider"], message: "Escolha o provedor do decisor" })
        if (!value.writer.provider) ctx.addIssue({ code: "custom", path: ["writer", "provider"], message: "Escolha o provedor do redator" })
        if (!value.scope.all && !value.scope.centralIds.length) ctx.addIssue({ code: "custom", path: ["scope", "centralIds"], message: "Escolha ao menos uma central" })
    })
export type MentorSettings = z.infer<typeof mentorSettingsSchema>

/** Destinos ligados, na ordem do catálogo. */
export function enabledTargets(targets: Record<MentorTarget, boolean>): MentorTarget[] {
    return MENTOR_TARGETS.filter((target) => targets[target])
}

/**
 * Destinos que valem numa execução (OPE-165): os ligados, menos o Agente Adversário quando ele está
 * desativado (as listas do desenvolvedor não dependem mais dele).
 */
export function effectiveTargets(targets: Record<MentorTarget, boolean>, adversaryEnabled: boolean): MentorTarget[] {
    return enabledTargets(targets).filter((target) => target !== "adversarial" || adversaryEnabled)
}

export const DEFAULT_MENTOR_SETTINGS: MentorSettings = {
    enabled: false,
    learnOnDone: true,
    scope: { all: true, centralIds: [] },
    digest: { provider: null, model: null, variant: null, budgetUsd: MENTOR_BUDGET_DEFAULT, compactThresholdChars: MENTOR_COMPACT_DEFAULT, timeoutSeconds: MENTOR_DIGEST_TIMEOUT_DEFAULT },
    decider: { provider: null, model: null, variant: null },
    level: "balanced",
    router: { provider: null, model: null, variant: null, instructions: "" },
    targets: { adversarial: true, "developer-global": true, "developer-central": true },
    writer: { provider: null, model: null, variant: null, instructions: DEFAULT_MENTOR_WRITER_INSTRUCTIONS },
    timeoutSeconds: MENTOR_TIMEOUT_DEFAULT,
}

/** Aprovar uma sugestão (o texto pode ser editado antes). */
export const mentorApproveSchema = z.object({
    text: z.string().trim().min(3, "Escreva a memória").max(MEMORY_TEXT_MAX, `Até ${MEMORY_TEXT_MAX.toLocaleString("pt-BR")} caracteres`).optional(),
    /** Lista de destino (trocar antes de aprovar; ausente = a escolhida pelo Triador). */
    target: z.enum(MENTOR_TARGETS).optional(),
    /** Texto da parte separada (quando a execução gravou as duas listas do desenvolvedor). */
    extraText: z.string().trim().min(3, "Escreva a memória").max(MEMORY_TEXT_MAX, `Até ${MEMORY_TEXT_MAX.toLocaleString("pt-BR")} caracteres`).optional(),
    /** `false` grava só a memória principal (a parte separada é descartada). Padrão: gravar as duas. */
    includeExtra: z.boolean().optional(),
})
export type MentorApproveInput = z.infer<typeof mentorApproveSchema>

// ── Reorganização do acervo (OPE-132) ──────────────────────────────────────

/** Recorte do acervo revisado: listas (destinos) e centrais; vazio = o escopo do Mentor. */
export const mentorReorgScopeSchema = z.object({
    targets: z.array(z.enum(MENTOR_TARGETS)).max(MENTOR_TARGETS.length).optional(),
    centralIds: z.array(z.string().trim().min(1).max(40)).max(200).optional(),
})
export type MentorReorgScopeInput = z.infer<typeof mentorReorgScopeSchema>

/** Aprovar tudo (sem `itemIds`) ou só os itens escolhidos, com o texto e a confirmação do dono por item. */
export const mentorReorgApplySchema = z.object({
    itemIds: z.array(z.string().trim().min(1).max(120)).max(1000).optional(),
    overrides: z
        .record(
            z.string(),
            z.object({
                text: z.string().trim().min(3, "Escreva a memória").max(MEMORY_TEXT_MAX, `Até ${MEMORY_TEXT_MAX.toLocaleString("pt-BR")} caracteres`).optional(),
                /** Arquivar uma memória do dono numa fusão exige esta confirmação explícita. */
                confirmOwner: z.boolean().optional(),
            }),
        )
        .optional(),
})
export type MentorReorgApplyInput = z.infer<typeof mentorReorgApplySchema>

/** Descartar tudo (sem `itemIds`) ou só os itens escolhidos. */
export const mentorReorgDiscardSchema = z.object({ itemIds: z.array(z.string().trim().min(1).max(120)).max(1000).optional() })
export type MentorReorgDiscardInput = z.infer<typeof mentorReorgDiscardSchema>

/** `GET /api/adversarial/mentor/runs` — filtros e página das execuções (listas em CSV, datas ISO). */
export const mentorRunListQuerySchema = z.object({
    q: z.string().trim().max(200).optional().transform((value) => value ?? ""),
    statuses: csvList.pipe(z.array(z.enum(MENTOR_RUN_STATUSES)).max(MENTOR_RUN_STATUSES.length)),
    sources: csvList.pipe(z.array(z.enum(MENTOR_SOURCES)).max(MENTOR_SOURCES.length)),
    triggers: csvList.pipe(z.array(z.enum(MENTOR_USER_TRIGGERS)).max(MENTOR_USER_TRIGGERS.length)),
    centrals: objectIdCsv("Central"),
    from: isoDate.optional(),
    to: isoDate.optional(),
    ...pageQuery(MENTOR_PAGE_LIMIT, MENTOR_PAGE_LIMIT_MAX),
})
export type MentorRunListQuery = z.infer<typeof mentorRunListQuerySchema>
