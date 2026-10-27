import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AiFeatureSetting } from "@/lib/db/models/Ai"
import { DomainError } from "@/lib/api/route"
import { getAiProviderStatuses, listAiAgents, listAiModels } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"
import { publishAppEvent } from "@/lib/pusher/channels"
import { AGENT_ROLE_LABELS, AGENT_ROLES, AGENTIC_FEATURE, AGENTIC_UPDATED_EVENT } from "../constants"
import { agenticSettingsSchema, DEFAULT_AGENTIC_SETTINGS, withDefaultAgents, type AgentConfig, type AgenticColumns, type AgenticSettings } from "../schemas"
import type { AgenticAvailability, AgenticSettingsDto } from "../types"

const AUDIT_ENTITY = "FeatureIA"

export async function loadAgenticSettings(): Promise<{ settings: AgenticSettings; isDefault: boolean; updatedAt: Date | null }> {
    await dbConnect()
    const doc = await AiFeatureSetting.findOne({ feature: AGENTIC_FEATURE }).lean()
    if (!doc) return { settings: DEFAULT_AGENTIC_SETTINGS, isDefault: true, updatedAt: null }
    const parsed = agenticSettingsSchema.safeParse(withDefaultAgents(doc.settings))
    return { settings: parsed.success ? parsed.data : DEFAULT_AGENTIC_SETTINGS, isDefault: !parsed.success, updatedAt: doc.updatedAt ?? null }
}

export async function agenticAvailability(settings: AgenticSettings): Promise<AgenticAvailability> {
    if (!settings.enabled) return { available: false, reason: "O desenvolvimento agêntico está desativado em Integrações › Provedores de IA" }
    const status = (await getAiProviderStatuses()).find((item) => item.id === "opencode")
    if (!status?.configured) return { available: false, reason: "O OpenCode não está configurado em Integrações › Provedores de IA" }
    if (!status.connected) return { available: false, reason: "O OpenCode não está conectado: teste a conexão em Integrações › Provedores de IA" }
    return { available: true, reason: null }
}

export async function getAgenticSettings(): Promise<AgenticSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadAgenticSettings()
    return { settings, isDefault, availability: await agenticAvailability(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

/** Confere no OpenCode os agentes, modelos e variantes informados (ignora quando desconectado). */
export async function assertAgentConfigs(configs: { label: string; config: AgentConfig | null }[], strict: boolean): Promise<void> {
    const used = configs.filter((item): item is { label: string; config: AgentConfig } => Boolean(item.config && (item.config.agent || item.config.model || item.config.fallbacks?.length)))
    if (!used.length) return
    const status = (await getAiProviderStatuses()).find((item) => item.id === "opencode")
    if (!status?.connected) {
        if (strict) throw new DomainError(409, "O OpenCode não está conectado: teste a conexão antes de ativar", "AI_PROVIDER_DISCONNECTED")
        return
    }
    try {
        const [models, agents] = await Promise.all([listAiModels("opencode"), listAiAgents()])
        for (const { label, config } of used) {
            if (config.agent && !agents.some((agent) => agent.id === config.agent)) throw new DomainError(400, `${label}: agente ${config.agent} não existe no OpenCode`, "AI_AGENT_NOT_FOUND")
            const choices = [...(config.model ? [{ prefix: label, model: config.model, variant: config.variant }] : []), ...(config.fallbacks ?? []).map((item, index) => ({ prefix: `${label} (fallback ${index + 1})`, model: item.model, variant: item.variant }))]
            for (const choice of choices) {
                const model = models.find((item) => item.id === choice.model)
                if (!model) throw new DomainError(400, `${choice.prefix}: modelo ${choice.model} não está disponível no OpenCode`, "AI_MODEL_NOT_FOUND")
                if (choice.variant && !model.variants.includes(choice.variant)) throw new DomainError(400, `${choice.prefix}: variante "${choice.variant}" não existe no modelo ${model.name}`, "AI_VARIANT_NOT_FOUND")
            }
        }
    } catch (error) {
        if (error instanceof AiProviderError) throw new DomainError(502, error.message, "AI_PROVIDER_ERROR")
        throw error
    }
}

const normalizeAgent = (config: AgentConfig): AgentConfig => ({
    agent: config.agent || null,
    model: config.model || null,
    variant: config.model ? config.variant || null : null,
    // Agentes padrão: sem lista = sem fallback.
    fallbacks: (config.fallbacks ?? []).map((item) => ({ model: item.model, variant: item.variant || null })),
})

/** Coluna global: texto vazio vira `null` ("nenhuma"/"não mover"). */
const normalizeColumn = (value: string | null): string | null => (value && value.trim() ? value.trim() : null)

const normalizeColumns = (columns: AgenticColumns): AgenticColumns => ({
    queue: normalizeColumn(columns.queue),
    onStart: normalizeColumn(columns.onStart),
    onPr: normalizeColumn(columns.onPr),
    onDone: normalizeColumn(columns.onDone),
})

export async function saveAgenticSettings(input: AgenticSettings, actorId: string): Promise<AgenticSettingsDto> {
    const next: AgenticSettings = {
        enabled: input.enabled,
        agents: Object.fromEntries(AGENT_ROLES.map((role) => [role, normalizeAgent(input.agents[role])])) as AgenticSettings["agents"],
        columns: normalizeColumns(input.columns),
        ci: { fixCi: input.ci.fixCi, ciFixLimit: input.ci.ciFixLimit },
        liveChat: input.liveChat === true,
    }
    await assertAgentConfigs(
        AGENT_ROLES.map((role) => ({ label: AGENT_ROLE_LABELS[role].label, config: next.agents[role] })),
        next.enabled,
    )
    const before = await loadAgenticSettings()
    await AiFeatureSetting.updateOne({ feature: AGENTIC_FEATURE }, { $set: { settings: next, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true })
    await recordAudit({
        userId: actorId,
        entidade: AUDIT_ENTITY,
        entidadeId: AGENTIC_FEATURE,
        acao: before.isDefault ? AcaoAuditoria.CRIAR : AcaoAuditoria.ATUALIZAR,
        antes: before.isDefault ? undefined : before.settings,
        depois: next,
    })
    await publishAppEvent(AGENTIC_UPDATED_EVENT, { scope: "settings" }).catch(() => undefined)
    // A fila global pode ter mudado: reavalia as centrais que a herdam (import dinâmico evita ciclo).
    void import("./queue")
        .then((queue) => queue.pumpAllCentralQueues())
        .catch(() => undefined)
    return getAgenticSettings()
}

