import { z } from "zod"
import { csvList, isoDate, objectIdCsv, pageQuery } from "@/lib/list/query"
import { agentConfigSchema } from "@/features/agentic/schemas"
import {
    ADVERSARIAL_ATTACHMENT_MODES,
    ADVERSARIAL_CORRECTION_MODES,
    ADVERSARIAL_DECISIONS,
    ADVERSARIAL_LEVELS,
    ADVERSARIAL_PAGE_LIMIT,
    ADVERSARIAL_PAGE_LIMIT_MAX,
    ADVERSARIAL_REVIEW_STATES,
    ADVERSARIAL_ROUNDS_DEFAULT,
    ADVERSARIAL_ROUNDS_MAX,
    ADVERSARIAL_ROUNDS_MIN,
    ADVERSARIAL_STOP_POLICIES,
    ADVERSARIAL_TIMEOUT_DEFAULT,
    ADVERSARIAL_TIMEOUT_MAX,
    ADVERSARIAL_TIMEOUT_MIN,
} from "./constants"

const int = (min: number, max: number) =>
    z
        .number({ error: "Informe um número" })
        .int("Use um número inteiro")
        .min(min, `Mínimo ${min}`)
        .max(max, `Máximo ${max}`)

/**
 * O que entra no contexto do adversário. Cada fonte é uma chave independente: o adversário começa
 * do zero (sessão nova) e só vê o que estiver ligado aqui, além do código.
 */
export const adversarialContextSchema = z.object({
    task: z.object({
        basics: z.boolean(),
        description: z.boolean(),
        technicalSpec: z.boolean(),
        comments: z.boolean(),
        history: z.boolean(),
        timeLogs: z.boolean(),
        insights: z.boolean(),
        attachments: z.enum(ADVERSARIAL_ATTACHMENT_MODES),
    }),
    workbench: z.object({
        approvedPlan: z.boolean(),
        planHistory: z.boolean(),
        cycleFeedback: z.boolean(),
        centralInstructions: z.boolean(),
    }),
    rounds: z.object({
        /** Achados bloqueantes da rodada anterior e as contestações do implementador. */
        previousFindings: z.boolean(),
    }),
})
export type AdversarialContext = z.infer<typeof adversarialContextSchema>

/** Configuração do Agente Adversário — mesmo schema na tela e na API. */
export const adversarialSettingsSchema = z
    .object({
        enabled: z.boolean(),
        /** Sempre OpenCode: agente, modelo, variante e modelos de fallback. */
        agent: agentConfigSchema,
        level: z.enum(ADVERSARIAL_LEVELS),
        correction: z.enum(ADVERSARIAL_CORRECTION_MODES),
        rounds: z.object({
            limited: z.boolean(),
            max: int(ADVERSARIAL_ROUNDS_MIN, ADVERSARIAL_ROUNDS_MAX),
            onLimit: z.enum(ADVERSARIAL_STOP_POLICIES),
        }),
        onFailure: z.enum(ADVERSARIAL_STOP_POLICIES),
        scope: z.object({
            all: z.boolean(),
            centralIds: z.array(z.string().trim().min(1).max(40)).max(200),
        }),
        timeoutMinutes: int(ADVERSARIAL_TIMEOUT_MIN, ADVERSARIAL_TIMEOUT_MAX),
        /** Instruções adicionais (opcional), somadas às regras do nível. */
        instructions: z.string().trim().max(8000, "Até 8.000 caracteres"),
        context: adversarialContextSchema,
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.agent.model) ctx.addIssue({ code: "custom", path: ["agent", "model"], message: "Selecione o modelo" })
        if (!value.scope.all && !value.scope.centralIds.length) ctx.addIssue({ code: "custom", path: ["scope", "centralIds"], message: "Escolha ao menos uma central" })
    })
export type AdversarialSettings = z.infer<typeof adversarialSettingsSchema>

export const DEFAULT_ADVERSARIAL_CONTEXT: AdversarialContext = {
    task: {
        basics: true,
        description: true,
        technicalSpec: true,
        comments: false,
        history: false,
        timeLogs: false,
        insights: false,
        attachments: "names",
    },
    workbench: { approvedPlan: false, planHistory: false, cycleFeedback: false, centralInstructions: false },
    rounds: { previousFindings: true },
}

export const DEFAULT_ADVERSARIAL_SETTINGS: AdversarialSettings = {
    enabled: false,
    agent: { agent: null, model: null, variant: null, fallbacks: [] },
    level: "balanced",
    correction: "auto",
    rounds: { limited: true, max: ADVERSARIAL_ROUNDS_DEFAULT, onLimit: "pause" },
    onFailure: "pause",
    scope: { all: true, centralIds: [] },
    timeoutMinutes: ADVERSARIAL_TIMEOUT_DEFAULT,
    instructions: "",
    context: DEFAULT_ADVERSARIAL_CONTEXT,
}

/** "Corrigir" na mesa: texto opcional ao implementador e achados bloqueantes desmarcados (ignorados). */
export const adversarialFixSchema = z.object({
    text: z.string().trim().max(8000, "Até 8.000 caracteres").optional(),
    excluded: z.array(z.string().trim().min(1).max(20)).max(100).optional(),
})
export type AdversarialFixInput = z.infer<typeof adversarialFixSchema>

/** `GET /api/adversarial/reviews` — filtros e página das rodadas (listas em CSV, datas ISO). */
export const adversarialReviewListQuerySchema = z.object({
    q: z.string().trim().max(200).optional().transform((value) => value ?? ""),
    states: csvList.pipe(z.array(z.enum(ADVERSARIAL_REVIEW_STATES)).max(ADVERSARIAL_REVIEW_STATES.length)),
    decisions: csvList.pipe(z.array(z.enum(ADVERSARIAL_DECISIONS)).max(ADVERSARIAL_DECISIONS.length)),
    levels: csvList.pipe(z.array(z.enum(ADVERSARIAL_LEVELS)).max(ADVERSARIAL_LEVELS.length)),
    centrals: objectIdCsv("Central"),
    from: isoDate.optional(),
    to: isoDate.optional(),
    ...pageQuery(ADVERSARIAL_PAGE_LIMIT, ADVERSARIAL_PAGE_LIMIT_MAX),
})
export type AdversarialReviewListQuery = z.infer<typeof adversarialReviewListQuerySchema>
