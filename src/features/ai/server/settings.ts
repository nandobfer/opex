import type { ZodType } from "zod"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AiFeatureSetting } from "@/lib/db/models/Ai"
import { DomainError } from "@/lib/api/route"
import { runAfterResponse } from "@/lib/after-response"
import { getAiProviderStatuses, listAiAgents, listAiModels } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"
import { getAiProvider, type AiProviderId } from "@/lib/ai/providers"
import { publishAppEvent } from "@/lib/pusher/channels"
import { AI_AUDIT_ENTITY, AI_FEATURE_UPDATED_EVENT } from "../constants"
import {
    DEFAULT_BUDGET_PREVIEW_SETTINGS,
    DEFAULT_TASK_SUMMARY_SETTINGS,
    DEFAULT_UNDERSTAND_TASK_SETTINGS,
    budgetPreviewSettingsSchema,
    taskSummarySettingsSchema,
    understandTaskSettingsSchema,
    type BudgetPreviewSettings,
    type TaskSummarySettings,
    type UnderstandTaskSettings,
} from "../schemas"
import type { AiFeatureAvailability, BudgetPreviewSettingsDto, TaskSummarySettingsDto, UnderstandTaskSettingsDto } from "../types"

const UNDERSTAND_TASK_FEATURE = "understand-task"
const TASK_SUMMARY_FEATURE = "task-summary"
const BUDGET_PREVIEW_FEATURE = "budget-preview"

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
async function persistFeature<T extends ProviderSettings>(feature: string, next: T, actorId: string, before: { isDefault: boolean; settings: T }): Promise<void> {
    await AiFeatureSetting.updateOne({ feature }, { $set: { settings: next, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true })
    await recordAudit({
        userId: actorId,
        entidade: AI_AUDIT_ENTITY,
        entidadeId: feature,
        acao: before.isDefault ? AcaoAuditoria.CRIAR : AcaoAuditoria.ATUALIZAR,
        antes: before.isDefault ? undefined : before.settings,
        depois: next,
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
