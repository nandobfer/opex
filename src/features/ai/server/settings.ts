import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AiFeatureSetting } from "@/lib/db/models/Ai"
import { DomainError } from "@/lib/api/route"
import { getAiProviderStatuses, listAiAgents, listAiModels } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"
import { getAiProvider } from "@/lib/ai/providers"
import { publishAppEvent } from "@/lib/pusher/channels"
import { AI_AUDIT_ENTITY, AI_FEATURE_UPDATED_EVENT } from "../constants"
import { DEFAULT_UNDERSTAND_TASK_SETTINGS, understandTaskSettingsSchema, type UnderstandTaskSettings } from "../schemas"
import type { AiFeatureAvailability, UnderstandTaskSettingsDto } from "../types"

const FEATURE = "understand-task"

/** Configuração salva (validada); inválida ou ausente cai nos valores iniciais. */
export async function loadUnderstandTaskSettings(): Promise<{ settings: UnderstandTaskSettings; isDefault: boolean; updatedAt: Date | null }> {
    await dbConnect()
    const doc = await AiFeatureSetting.findOne({ feature: FEATURE }).lean()
    if (!doc) return { settings: DEFAULT_UNDERSTAND_TASK_SETTINGS, isDefault: true, updatedAt: null }
    const parsed = understandTaskSettingsSchema.safeParse({ ...DEFAULT_UNDERSTAND_TASK_SETTINGS, ...doc.settings })
    return { settings: parsed.success ? parsed.data : DEFAULT_UNDERSTAND_TASK_SETTINGS, isDefault: !parsed.success, updatedAt: doc.updatedAt ?? null }
}

export async function availabilityOf(settings: UnderstandTaskSettings): Promise<AiFeatureAvailability> {
    if (!settings.enabled) return { available: false, reason: "\"Entender tarefas\" está desativada em Integrações › Provedores de IA" }
    if (!settings.provider || !settings.model) return { available: false, reason: "Selecione o provedor e o modelo em Integrações › Provedores de IA" }
    const status = (await getAiProviderStatuses()).find((item) => item.id === settings.provider)
    if (!status?.configured) return { available: false, reason: `${getAiProvider(settings.provider).name} não está configurado` }
    if (!status.connected) return { available: false, reason: `${getAiProvider(settings.provider).name} não está conectado: teste a conexão em Integrações › Provedores de IA` }
    return { available: true, reason: null }
}

export async function getUnderstandTaskSettings(): Promise<UnderstandTaskSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadUnderstandTaskSettings()
    return { settings, isDefault, availability: await availabilityOf(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

/** Confere no provedor o modelo, a variante e o agente escolhidos. */
async function assertCatalog(settings: UnderstandTaskSettings): Promise<void> {
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
export function normalizeSettings(input: UnderstandTaskSettings): UnderstandTaskSettings {
    const provider = input.provider ? getAiProvider(input.provider) : null
    return {
        ...input,
        agent: provider?.supportsAgent ? input.agent || null : null,
        variant: input.variant || null,
        temperature: provider?.supportsSampling ? input.temperature : null,
        maxOutputTokens: provider?.supportsSampling ? input.maxOutputTokens : null,
    }
}

export async function saveUnderstandTaskSettings(input: UnderstandTaskSettings, actorId: string): Promise<UnderstandTaskSettingsDto> {
    const next = normalizeSettings(input)
    await assertCatalog(next)
    const before = await loadUnderstandTaskSettings()
    await AiFeatureSetting.updateOne({ feature: FEATURE }, { $set: { settings: next, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true })
    await recordAudit({
        userId: actorId,
        entidade: AI_AUDIT_ENTITY,
        entidadeId: FEATURE,
        acao: before.isDefault ? AcaoAuditoria.CRIAR : AcaoAuditoria.ATUALIZAR,
        antes: before.isDefault ? undefined : before.settings,
        depois: next,
    })
    await publishAppEvent(AI_FEATURE_UPDATED_EVENT, { feature: FEATURE }).catch(() => undefined)
    return getUnderstandTaskSettings()
}
