import type { ZodType } from "zod"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AiFeatureSetting } from "@/lib/db/models/Ai"
import { DomainError } from "@/lib/api/route"
import { runAfterResponse } from "@/lib/after-response"
import { getAiProviderStatuses, listAiAgents, listAiModels } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"
import { getAiProvider, type AiProviderId } from "@/lib/ai/providers"
import { normalizeTaxonomy } from "@/features/tasks/tags"
import { publishAppEvent } from "@/lib/pusher/channels"
import { AI_AUDIT_ENTITY, AI_FEATURE_UPDATED_EVENT } from "../constants"
import {
    DEFAULT_BUDGET_PREVIEW_SETTINGS,
    DEFAULT_ESTIMATE_HOURS_SETTINGS,
    DEFAULT_TASK_REFINEMENT_SETTINGS,
    DEFAULT_TASK_SUMMARY_SETTINGS,
    DEFAULT_TASK_TAGS_SETTINGS,
    DEFAULT_UNDERSTAND_TASK_SETTINGS,
    budgetPreviewSettingsSchema,
    estimateHoursSettingsSchema,
    taskRefinementSettingsSchema,
    taskSummarySettingsSchema,
    taskTagsSettingsSchema,
    understandTaskSettingsSchema,
    type BudgetPreviewSettings,
    type EstimateHoursSettings,
    type TaskRefinementSettings,
    type TaskSummarySettings,
    type TaskTagsSettings,
    type UnderstandTaskSettings,
} from "../schemas"
import type { AiFeatureAvailability, BudgetPreviewSettingsDto, EstimateHoursSettingsDto, TaskRefinementSettingsDto, TaskSummarySettingsDto, TaskTagsSettingsDto, UnderstandTaskSettingsDto } from "../types"
import { PR_REVIEW_FEATURE } from "@/features/pr-review/constants"
import { DEFAULT_PR_REVIEW_SETTINGS, prReviewSettingsSchema, type PrReviewSettings } from "@/features/pr-review/schemas"
import type { PrReviewSettingsDto } from "@/features/pr-review/types"

const UNDERSTAND_TASK_FEATURE = "understand-task"
const TASK_SUMMARY_FEATURE = "task-summary"
const TASK_TAGS_FEATURE = "task-tags"
const BUDGET_PREVIEW_FEATURE = "budget-preview"
const ESTIMATE_HOURS_FEATURE = "estimate-hours"
const TASK_REFINEMENT_FEATURE = "task-refinement"

/** Campos de provedor comuns a toda feature de IA. */
type ProviderSettings = {
    enabled: boolean
    provider: AiProviderId | null
    model: string | null
    agent: string | null
    variant: string | null
    temperature: number | null
    maxOutputTokens: number | null
}

/** Configuração salva (validada); inválida ou ausente cai nos valores iniciais. */
async function loadFeature<T>(feature: string, schema: ZodType<T>, defaults: T): Promise<{ settings: T; isDefault: boolean; updatedAt: Date | null }> {
    await dbConnect()
    const doc = await AiFeatureSetting.findOne({ feature }).lean()
    if (!doc) return { settings: defaults, isDefault: true, updatedAt: null }
    const parsed = schema.safeParse({ ...defaults, ...doc.settings })
    return { settings: parsed.success ? parsed.data : defaults, isDefault: !parsed.success, updatedAt: doc.updatedAt ?? null }
}

/** Pode ser usada agora? Sem `available`, `reason` explica (botão desabilitado com o motivo). */
async function availability(settings: Pick<ProviderSettings, "enabled" | "provider" | "model">, featureLabel: string): Promise<AiFeatureAvailability> {
    if (!settings.enabled) return { available: false, reason: `${featureLabel} está desativada em Integrações › Provedores de IA` }
    if (!settings.provider || !settings.model) return { available: false, reason: "Selecione o provedor e o modelo em Integrações › Provedores de IA" }
    const status = (await getAiProviderStatuses()).find((item) => item.id === settings.provider)
    if (!status?.configured) return { available: false, reason: `${getAiProvider(settings.provider).name} não está configurado` }
    if (!status.connected) return { available: false, reason: `${getAiProvider(settings.provider).name} não está conectado: teste a conexão em Integrações › Provedores de IA` }
    return { available: true, reason: null }
}

/** Confere no provedor o modelo, a variante e o agente escolhidos. */
async function assertCatalog(settings: ProviderSettings): Promise<void> {
    if (!settings.provider || !settings.model) return
    const provider = getAiProvider(settings.provider)
    const status = (await getAiProviderStatuses()).find((item) => item.id === settings.provider)
    if (!status?.connected) {
        if (settings.enabled) throw new DomainError(409, `${provider.name} não está conectado: teste a conexão antes de ativar a feature`, "AI_PROVIDER_DISCONNECTED")
        return
    }
    try {
        const models = await listAiModels(settings.provider)
        const model = models.find((item) => item.id === settings.model)
        if (!model) throw new DomainError(400, `Modelo ${settings.model} não está disponível no ${provider.name}`, "AI_MODEL_NOT_FOUND")
        if (settings.variant && !model.variants.includes(settings.variant)) throw new DomainError(400, `${provider.variantLabel} "${settings.variant}" não existe no modelo ${model.name}`, "AI_VARIANT_NOT_FOUND")
        if (provider.supportsAgent && settings.agent) {
            const agents = await listAiAgents()
            if (!agents.some((agent) => agent.id === settings.agent)) throw new DomainError(400, `Agente ${settings.agent} não existe no OpenCode`, "AI_AGENT_NOT_FOUND")
        }
    } catch (error) {
        if (error instanceof AiProviderError) throw new DomainError(502, error.message, "AI_PROVIDER_ERROR")
        throw error
    }
}

/** Campos que não se aplicam ao provedor escolhido são gravados vazios. */
function normalizeProvider<T extends ProviderSettings>(input: T): T {
    const provider = input.provider ? getAiProvider(input.provider) : null
    return {
        ...input,
        agent: provider?.supportsAgent ? input.agent || null : null,
        variant: input.variant || null,
        temperature: provider?.supportsSampling ? input.temperature : null,
        maxOutputTokens: provider?.supportsSampling ? input.maxOutputTokens : null,
    }
}

/** Campos que não se aplicam ao provedor escolhido são gravados vazios (provedor, modelo, amostragem e agente). */
export function normalizeSettings(input: UnderstandTaskSettings): UnderstandTaskSettings {
    return normalizeProvider(input)
}

export function normalizeTaskSummarySettings(input: TaskSummarySettings): TaskSummarySettings {
    return normalizeProvider(input)
}
async function persistFeature<T>(feature: string, next: T, actorId: string, before: { isDefault: boolean; settings: T }): Promise<void> {
    await AiFeatureSetting.updateOne({ feature }, { $set: { settings: next, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true })
    await recordAudit({
        userId: actorId,
        entidade: AI_AUDIT_ENTITY,
        entidadeId: feature,
        acao: before.isDefault ? AcaoAuditoria.CRIAR : AcaoAuditoria.ATUALIZAR,
        antes: before.isDefault ? undefined : (before.settings as Record<string, unknown>),
        depois: next as Record<string, unknown>,
    })
    await publishAppEvent(AI_FEATURE_UPDATED_EVENT, { feature }).catch(() => undefined)
}

// ── Entender tarefas ─────────────────────────────────────────────────────────

export async function loadUnderstandTaskSettings(): Promise<{ settings: UnderstandTaskSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature(UNDERSTAND_TASK_FEATURE, understandTaskSettingsSchema, DEFAULT_UNDERSTAND_TASK_SETTINGS)
}

export async function availabilityOf(settings: UnderstandTaskSettings): Promise<AiFeatureAvailability> {
    return availability(settings, '"Entender tarefas"')
}

export async function getUnderstandTaskSettings(): Promise<UnderstandTaskSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadUnderstandTaskSettings()
    return { settings, isDefault, availability: await availabilityOf(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export async function saveUnderstandTaskSettings(input: UnderstandTaskSettings, actorId: string): Promise<UnderstandTaskSettingsDto> {
    const next = normalizeSettings(input)
    await assertCatalog(next)
    const before = await loadUnderstandTaskSettings()
    await persistFeature(UNDERSTAND_TASK_FEATURE, next, actorId, before)
    return getUnderstandTaskSettings()
}

// ── Resumos de tarefas ───────────────────────────────────────────────────────

export async function loadTaskSummarySettings(): Promise<{ settings: TaskSummarySettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature(TASK_SUMMARY_FEATURE, taskSummarySettingsSchema, DEFAULT_TASK_SUMMARY_SETTINGS)
}

export async function availabilityOfTaskSummary(settings: TaskSummarySettings): Promise<AiFeatureAvailability> {
    return availability(settings, '"Resumos de tarefas"')
}

export async function getTaskSummarySettings(): Promise<TaskSummarySettingsDto> {
    const { settings, isDefault, updatedAt } = await loadTaskSummarySettings()
    return { settings, isDefault, availability: await availabilityOfTaskSummary(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

/** Ao ativar a feature, varre as tarefas não concluídas que ainda não têm resumo (em segundo plano). */
function scheduleTaskSummaryBackfill(): void {
    runAfterResponse("task-summary-backfill", async () => {
        const { runTaskSummaryBackfill } = await import("./task-summary")
        await runTaskSummaryBackfill()
    })
}

export async function saveTaskSummarySettings(input: TaskSummarySettings, actorId: string): Promise<TaskSummarySettingsDto> {
    const next = normalizeTaskSummarySettings(input)
    await assertCatalog(next)
    const before = await loadTaskSummarySettings()
    await persistFeature(TASK_SUMMARY_FEATURE, next, actorId, before)
    if (next.enabled && !before.settings.enabled) scheduleTaskSummaryBackfill()
    return getTaskSummarySettings()
}

// ── Tags de tarefas (provider configurável; JEV pela taxonomia fechada) ──────

export async function loadTaskTagsSettings(): Promise<{ settings: TaskTagsSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature(TASK_TAGS_FEATURE, taskTagsSettingsSchema, DEFAULT_TASK_TAGS_SETTINGS)
}

/** A feature pode ser usada agora (qualquer provedor conectado, texto ou JEV). */
export async function availabilityOfTaskTags(settings: TaskTagsSettings): Promise<AiFeatureAvailability> {
    return availability(settings, '"Tags de tarefas"')
}

export async function getTaskTagsSettings(): Promise<TaskTagsSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadTaskTagsSettings()
    return { settings, isDefault, availability: await availabilityOfTaskTags(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

/** Campos que não se aplicam ao provedor viram vazios; a taxonomia é normalizada (ids/duplicatas). */
export function normalizeTaskTagsSettings(input: TaskTagsSettings): TaskTagsSettings {
    const normalized = normalizeProvider(input)
    return { ...normalized, taxonomy: normalizeTaxonomy(normalized.taxonomy) }
}

/** Ao ativar a feature, varre as tarefas não concluídas que ainda não têm tags (em segundo plano). */
function scheduleTaskTagsBackfill(): void {
    runAfterResponse("task-tags-backfill", async () => {
        const { runTaskTagsBackfill } = await import("./task-tags")
        await runTaskTagsBackfill()
    })
}

export async function saveTaskTagsSettings(input: TaskTagsSettings, actorId: string): Promise<TaskTagsSettingsDto> {
    const next = normalizeTaskTagsSettings(input)
    await assertCatalog(next)
    const before = await loadTaskTagsSettings()
    await persistFeature(TASK_TAGS_FEATURE, next, actorId, before)
    if (next.enabled && !before.settings.enabled) scheduleTaskTagsBackfill()
    return getTaskTagsSettings()
}

// ── Orçamentos (prévia do portal do cliente) ─────────────────────────────────

export async function loadBudgetPreviewSettings(): Promise<{ settings: BudgetPreviewSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature(BUDGET_PREVIEW_FEATURE, budgetPreviewSettingsSchema, DEFAULT_BUDGET_PREVIEW_SETTINGS)
}

export async function availabilityOfBudgetPreview(settings: BudgetPreviewSettings): Promise<AiFeatureAvailability> {
    return availability(settings, '"Orçamentos"')
}

export async function getBudgetPreviewSettings(): Promise<BudgetPreviewSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadBudgetPreviewSettings()
    return { settings, isDefault, availability: await availabilityOfBudgetPreview(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export function normalizeBudgetPreviewSettings(input: BudgetPreviewSettings): BudgetPreviewSettings {
    return normalizeProvider(input)
}

export async function saveBudgetPreviewSettings(input: BudgetPreviewSettings, actorId: string): Promise<BudgetPreviewSettingsDto> {
    const next = normalizeBudgetPreviewSettings(input)
    await assertCatalog(next)
    const before = await loadBudgetPreviewSettings()
    await persistFeature(BUDGET_PREVIEW_FEATURE, next, actorId, before)
    return getBudgetPreviewSettings()
}

// ── Estimar prazos (agente OpenCode que consulta o banco) ────────────────────

export async function loadEstimateHoursSettings(): Promise<{ settings: EstimateHoursSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature(ESTIMATE_HOURS_FEATURE, estimateHoursSettingsSchema, DEFAULT_ESTIMATE_HOURS_SETTINGS)
}

/** A feature pode usar provedores de texto ou o JEV (decisão estruturada). */
export async function availabilityOfEstimateHours(settings: EstimateHoursSettings): Promise<AiFeatureAvailability> {
    return availability(settings, '"Estimar prazos"')
}

export async function getEstimateHoursSettings(): Promise<EstimateHoursSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadEstimateHoursSettings()
    return { settings, isDefault, availability: await availabilityOfEstimateHours(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export function normalizeEstimateHoursSettings(input: EstimateHoursSettings): EstimateHoursSettings {
    return normalizeProvider(input)
}

export async function saveEstimateHoursSettings(input: EstimateHoursSettings, actorId: string): Promise<EstimateHoursSettingsDto> {
    const next = normalizeEstimateHoursSettings(input)
    await assertCatalog(next)
    const before = await loadEstimateHoursSettings()
    await persistFeature(ESTIMATE_HOURS_FEATURE, next, actorId, before)
    return getEstimateHoursSettings()
}

// ── Refinar tarefa (agente OpenCode que conduz perguntas até a spec ficar clara) ──

export async function loadTaskRefinementSettings(): Promise<{ settings: TaskRefinementSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature(TASK_REFINEMENT_FEATURE, taskRefinementSettingsSchema, DEFAULT_TASK_REFINEMENT_SETTINGS)
}

/** A feature é exclusiva do OpenCode (depende da sessão longa e do sistema de perguntas). */
export async function availabilityOfTaskRefinement(settings: TaskRefinementSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: "opencode", model: settings.model }, '"Refinar tarefa"')
}

export async function getTaskRefinementSettings(): Promise<TaskRefinementSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadTaskRefinementSettings()
    return { settings, isDefault, availability: await availabilityOfTaskRefinement(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export function normalizeTaskRefinementSettings(input: TaskRefinementSettings): TaskRefinementSettings {
    return { ...input, agent: input.agent || null, variant: input.variant || null }
}

export async function saveTaskRefinementSettings(input: TaskRefinementSettings, actorId: string): Promise<TaskRefinementSettingsDto> {
    const next = normalizeTaskRefinementSettings(input)
    await assertCatalog({ enabled: next.enabled, provider: "opencode", model: next.model, agent: next.agent, variant: next.variant, temperature: null, maxOutputTokens: null })
    const before = await loadTaskRefinementSettings()
    await persistFeature(TASK_REFINEMENT_FEATURE, next, actorId, before)
    return getTaskRefinementSettings()
}

// ── Revisão de PR (agente OpenCode que executa a skill de code review) ──────

export async function loadPrReviewSettings(): Promise<{ settings: PrReviewSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature(PR_REVIEW_FEATURE, prReviewSettingsSchema, DEFAULT_PR_REVIEW_SETTINGS)
}

/** Exclusiva do OpenCode (sessão com ferramentas, `gh` e skills). */
export async function availabilityOfPrReview(settings: PrReviewSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: "opencode", model: settings.model }, '"Revisão de PR"')
}

export async function getPrReviewSettings(): Promise<PrReviewSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadPrReviewSettings()
    return { settings, isDefault, availability: await availabilityOfPrReview(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export function normalizePrReviewSettings(input: PrReviewSettings): PrReviewSettings {
    return { ...input, agent: input.agent || null, variant: input.variant || null }
}

export async function savePrReviewSettings(input: PrReviewSettings, actorId: string): Promise<PrReviewSettingsDto> {
    const next = normalizePrReviewSettings(input)
    await assertCatalog({ enabled: next.enabled, provider: "opencode", model: next.model, agent: next.agent, variant: next.variant, temperature: null, maxOutputTokens: null })
    const before = await loadPrReviewSettings()
    await persistFeature(PR_REVIEW_FEATURE, next, actorId, before)
    return getPrReviewSettings()
}
