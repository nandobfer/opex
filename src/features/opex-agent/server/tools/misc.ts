import { z } from "zod"
import type { ZodType } from "zod"
import {
    budgetPreviewSettingsSchema,
    estimateHoursSettingsSchema,
    taskRefinementSettingsSchema,
    taskSummarySettingsSchema,
    taskTagsSettingsSchema,
    understandTaskSettingsSchema,
} from "@/features/ai/schemas"
import {
    getBudgetPreviewSettings,
    getEstimateHoursSettings,
    getPrReviewSettings,
    getTaskRefinementSettings,
    getTaskSummarySettings,
    getTaskTagsSettings,
    getUnderstandTaskSettings,
    saveBudgetPreviewSettings,
    saveEstimateHoursSettings,
    savePrReviewSettings,
    saveTaskRefinementSettings,
    saveTaskSummarySettings,
    saveTaskTagsSettings,
    saveUnderstandTaskSettings,
} from "@/features/ai/server/settings"
import { dashboardQuerySchema } from "@/features/dashboard/schemas"
import { buildDashboard } from "@/features/dashboard/server/service"
import { PR_REVIEW_PAGE_LIMIT_MAX } from "@/features/pr-review/constants"
import { prReviewSettingsSchema, requestPrReviewSchema } from "@/features/pr-review/schemas"
import { getPrReview, listPrReviews, requestPrReview, rerunPrReview, stopPrReview } from "@/features/pr-review/server/service"
import { defineTool } from "./define"
import { deepMerge, parseJsonObject } from "./json"

interface FeatureSettingsHandler {
    schema: ZodType<unknown>
    get: () => Promise<{ settings: unknown }>
    save: (input: never, actorId: string) => Promise<unknown>
}

/** Features de IA configuráveis pelo agente (a do próprio agente fica de fora). */
const AI_FEATURES = {
    "understand-task": { schema: understandTaskSettingsSchema, get: getUnderstandTaskSettings, save: saveUnderstandTaskSettings },
    "task-summary": { schema: taskSummarySettingsSchema, get: getTaskSummarySettings, save: saveTaskSummarySettings },
    "task-tags": { schema: taskTagsSettingsSchema, get: getTaskTagsSettings, save: saveTaskTagsSettings },
    "budget-preview": { schema: budgetPreviewSettingsSchema, get: getBudgetPreviewSettings, save: saveBudgetPreviewSettings },
    "estimate-hours": { schema: estimateHoursSettingsSchema, get: getEstimateHoursSettings, save: saveEstimateHoursSettings },
    "task-refinement": { schema: taskRefinementSettingsSchema, get: getTaskRefinementSettings, save: saveTaskRefinementSettings },
    "pr-review": { schema: prReviewSettingsSchema, get: getPrReviewSettings, save: savePrReviewSettings },
} satisfies Record<string, FeatureSettingsHandler>

const AI_FEATURE_KEYS = Object.keys(AI_FEATURES) as [keyof typeof AI_FEATURES, ...(keyof typeof AI_FEATURES)[]]

export const aiSettingsTools = [
    defineTool({
        name: "get_ai_feature_settings",
        group: "ai-settings",
        label: "Ler feature de IA",
        risk: "read",
        description: "Configuração de uma feature de IA do app (provedor, modelo, instruções...) e se ela pode ser usada agora. budget-preview é a feature \"Orçamentos\" (prévias).",
        input: z.object({ feature: z.enum(AI_FEATURE_KEYS) }),
        execute: async ({ feature }) => AI_FEATURES[feature].get(),
    }),
    defineTool({
        name: "update_ai_feature_settings",
        group: "ai-settings",
        label: "Configurar feature de IA",
        risk: "write",
        description: "Altera a configuração de uma feature de IA. `patchJson` é mesclado sobre a configuração atual (veja get_ai_feature_settings); o provedor precisa estar conectado para ativar.",
        input: z.object({ feature: z.enum(AI_FEATURE_KEYS), patchJson: z.string() }),
        summarize: (input) => `Alterar a configuração da feature de IA ${input.feature}`,
        execute: async ({ feature, patchJson }, context) => {
            const handler: FeatureSettingsHandler = AI_FEATURES[feature]
            const current = await handler.get()
            const next = handler.schema.parse(deepMerge(current.settings, parseJsonObject(patchJson, "patchJson")))
            return handler.save(next as never, context.actorId)
        },
    }),
]

export const prReviewTools = [
    defineTool({
        name: "list_pr_reviews",
        group: "pr-reviews",
        label: "Revisões do Agente Revisor",
        risk: "read",
        description: "Histórico das revisões de PR do Agente Revisor (as 50 mais recentes, com estado e veredito) e repositórios observados.",
        input: z.object({}),
        execute: async () => listPrReviews({ limit: PR_REVIEW_PAGE_LIMIT_MAX }),
    }),
    defineTool({
        name: "get_pr_review",
        group: "pr-reviews",
        label: "Ler revisão",
        risk: "read",
        description: "Detalhes de uma revisão de PR.",
        input: z.object({ id: z.string() }),
        execute: async ({ id }) => getPrReview(id),
    }),
    defineTool({
        name: "request_pr_review",
        group: "pr-reviews",
        label: "Pedir revisão",
        risk: "write",
        description: "Coloca na fila a revisão de um PR pela URL (https://github.com/org/repo/pull/N).",
        input: z.object({ url: z.string() }),
        summarize: (input) => `Revisar o PR ${input.url}`,
        execute: async ({ url }) => requestPrReview(requestPrReviewSchema.parse({ url }).url),
    }),
    defineTool({
        name: "rerun_pr_review",
        group: "pr-reviews",
        label: "Refazer revisão",
        risk: "write",
        description: "Refaz uma revisão de PR.",
        input: z.object({ id: z.string() }),
        summarize: () => "Refazer a revisão do PR",
        execute: async ({ id }) => rerunPrReview(id),
    }),
    defineTool({
        name: "stop_pr_review",
        group: "pr-reviews",
        label: "Parar revisão",
        risk: "destructive",
        description: "Interrompe uma revisão de PR em andamento.",
        input: z.object({ id: z.string() }),
        summarize: () => "Parar a revisão do PR em andamento",
        execute: async ({ id }) => stopPrReview(id),
    }),
]

export const dashboardTools = [
    defineTool({
        name: "get_dashboard",
        group: "dashboard",
        label: "Dashboard",
        risk: "read",
        description: "Métricas do período: KPIs e gráficos de tarefas, financeiro, horas agênticas e da central de desenvolvimento.",
        input: z.object({
            from: z.string().optional().describe("ISO 8601"),
            to: z.string().optional().describe("ISO 8601"),
            timeZone: z.string().optional().describe("Fuso IANA (padrão America/Sao_Paulo)"),
        }),
        execute: async (input) => buildDashboard(dashboardQuerySchema.parse({ ...input, timeZone: input.timeZone ?? "America/Sao_Paulo" })),
    }),
]
