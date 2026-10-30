import { z } from "zod"
import { csvList, isoDate, pageQuery } from "@/lib/list/query"
import {
    PR_REVIEW_CONCURRENCY_MAX,
    PR_REVIEW_PAGE_LIMIT,
    PR_REVIEW_PAGE_LIMIT_MAX,
    PR_REVIEW_REPLAN_LIMIT_MAX,
    PR_REVIEW_SCOPES,
    PR_REVIEW_STATES,
    PR_REVIEW_TIMEOUT_MAX,
    PR_REVIEW_TIMEOUT_MIN,
    PR_REVIEW_TRIGGERS,
    PR_REVIEW_VERDICTS,
} from "./constants"

/**
 * Configuração do "Agente Revisor" — agente do OpenCode que executa a skill de code review nos PRs
 * dos repositórios das centrais. Exclusiva do OpenCode (sessão com ferramentas, `gh` e skills).
 * Mesmo schema na tela e na API.
 */
export const prReviewSettingsSchema = z
    .object({
        enabled: z.boolean(),
        model: z.string().trim().max(200).nullable(),
        agent: z.string().trim().max(100).nullable(),
        variant: z.string().trim().max(50).nullable(),
        skill: z
            .string()
            .trim()
            .min(1, "Informe a skill")
            .max(100, "Até 100 caracteres")
            .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use só letras, números, ponto, hífen e sublinhado"),
        scope: z.enum(PR_REVIEW_SCOPES),
        includeDrafts: z.boolean(),
        includeWorkbenchPrs: z.boolean(),
        /** Revisão automática pedindo mudanças num PR de mesa faz a mesa replanejar. */
        replanOnChanges: z.boolean(),
        replanLimit: z.object({
            enabled: z.boolean(),
            max: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1, "Mínimo 1").max(PR_REVIEW_REPLAN_LIMIT_MAX, `Máximo ${PR_REVIEW_REPLAN_LIMIT_MAX}`),
        }),
        maxConcurrent: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1, "Mínimo 1").max(PR_REVIEW_CONCURRENCY_MAX, `Máximo ${PR_REVIEW_CONCURRENCY_MAX}`),
        timeoutMinutes: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(PR_REVIEW_TIMEOUT_MIN, `Mínimo ${PR_REVIEW_TIMEOUT_MIN}`).max(PR_REVIEW_TIMEOUT_MAX, `Máximo ${PR_REVIEW_TIMEOUT_MAX}`),
        /** Instruções adicionais (opcional), somadas à skill. */
        instructions: z.string().trim().max(8000, "Até 8.000 caracteres"),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Selecione o modelo" })
    })

export type PrReviewSettings = z.infer<typeof prReviewSettingsSchema>

export const DEFAULT_PR_REVIEW_SETTINGS: PrReviewSettings = {
    enabled: false,
    model: null,
    agent: null,
    variant: null,
    skill: "code-review",
    scope: "all",
    includeDrafts: false,
    includeWorkbenchPrs: true,
    replanOnChanges: true,
    replanLimit: { enabled: false, max: 3 },
    maxConcurrent: 1,
    timeoutMinutes: 60,
    instructions: "",
}

/** Revisar um PR pela URL (botão "Revisar PR"). */
export const requestPrReviewSchema = z.object({
    url: z
        .string()
        .trim()
        .regex(/^https:\/\/[^/\s]+\/[\w.-]+\/[\w.-]+\/pull\/\d+\/?(?:[?#].*)?$/, "Informe a URL do PR (ex.: https://github.com/org/repo/pull/12)"),
})
export type RequestPrReviewInput = z.infer<typeof requestPrReviewSchema>

/** `GET /api/pr-reviews` — filtros e página da lista do Agente Revisor (listas em CSV, datas ISO). */
export const prReviewListQuerySchema = z.object({
    q: z.string().trim().max(200).optional().transform((value) => value ?? ""),
    states: csvList.pipe(z.array(z.enum(PR_REVIEW_STATES)).max(PR_REVIEW_STATES.length)),
    verdicts: csvList.pipe(z.array(z.enum(PR_REVIEW_VERDICTS)).max(PR_REVIEW_VERDICTS.length)),
    repos: csvList.pipe(z.array(z.string().regex(/^[\w.-]+\/[\w.-]+$/, "Repositório inválido")).max(100)),
    triggers: csvList.pipe(z.array(z.enum(PR_REVIEW_TRIGGERS)).max(PR_REVIEW_TRIGGERS.length)),
    from: isoDate.optional(),
    to: isoDate.optional(),
    ...pageQuery(PR_REVIEW_PAGE_LIMIT, PR_REVIEW_PAGE_LIMIT_MAX),
})
export type PrReviewListQuery = z.infer<typeof prReviewListQuerySchema>
