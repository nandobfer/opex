import { z } from "zod"
import { assertCatalog, availability, loadFeature, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import type { AdversaryAgent } from "@/features/agentic/logic"
import { ADVERSARIAL_FEATURE } from "../constants"
import { adversaryAppliesTo } from "../scope"
import { DEFAULT_ADVERSARIAL_SETTINGS, adversarialSettingsSchema, type AdversarialSettings } from "../schemas"
import type { AdversarialSettingsDto } from "../types"

/** Configuração salva antes de um campo novo existir recebe o padrão dele antes de validar. */
export function withDefaults(saved: unknown): unknown {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return saved
    const value = saved as Partial<AdversarialSettings>
    const defaults = DEFAULT_ADVERSARIAL_SETTINGS
    return {
        ...defaults,
        ...value,
        rounds: { ...defaults.rounds, ...(value.rounds ?? {}) },
        scope: { ...defaults.scope, ...(value.scope ?? {}) },
        context: {
            task: { ...defaults.context.task, ...(value.context?.task ?? {}) },
            workbench: { ...defaults.context.workbench, ...(value.context?.workbench ?? {}) },
            rounds: { ...defaults.context.rounds, ...(value.context?.rounds ?? {}) },
        },
    }
}

export async function loadAdversarialSettings(): Promise<{ settings: AdversarialSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature<AdversarialSettings>(ADVERSARIAL_FEATURE, z.preprocess(withDefaults, adversarialSettingsSchema), DEFAULT_ADVERSARIAL_SETTINGS)
}

/** Exclusivo do OpenCode (sessão com ferramentas de leitura do repositório). */
export async function adversarialAvailability(settings: AdversarialSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: "opencode", model: settings.agent.model }, '"Agente Adversário"')
}

export async function getAdversarialSettings(): Promise<AdversarialSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadAdversarialSettings()
    return { settings, isDefault, availability: await adversarialAvailability(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export function normalizeAdversarialSettings(input: AdversarialSettings): AdversarialSettings {
    return {
        ...input,
        agent: { ...input.agent, agent: input.agent.agent || null, variant: input.agent.variant || null },
        scope: { all: input.scope.all, centralIds: input.scope.all ? [] : [...new Set(input.scope.centralIds)] },
    }
}

/** Salva conferindo no catálogo o modelo do adversário (OpenCode). */
export async function saveAdversarialSettings(input: AdversarialSettings, actorId: string): Promise<AdversarialSettingsDto> {
    const next = normalizeAdversarialSettings(input)
    await assertCatalog({ enabled: next.enabled, provider: "opencode", model: next.agent.model, agent: next.agent.agent, variant: next.agent.variant, temperature: null, maxOutputTokens: null }, next.agent.fallbacks ?? [])
    const before = await loadAdversarialSettings()
    await persistFeature(ADVERSARIAL_FEATURE, next, actorId, before)
    return getAdversarialSettings()
}

/**
 * Agente do Agente Adversário (agente, modelo, variante e fallbacks da aba): base do papel "Agente
 * Adversário" da mesa (OPE-187). `null` se a configuração não puder ser lida.
 */
export async function adversaryAgent(): Promise<AdversaryAgent | null> {
    try {
        const { agent } = (await loadAdversarialSettings()).settings
        return { agent: agent.agent ?? null, model: agent.model ?? null, variant: agent.model ? (agent.variant ?? null) : null, fallbacks: agent.fallbacks ?? [] }
    } catch {
        return null
    }
}

/**
 * A mesa desta central passa pelo adversário ao fim da implementação? Agente Adversário ativo e a
 * central no escopo (todas ou as escolhidas). Nunca lança: na dúvida, o fluxo segue sem a revisão.
 */
export async function adversaryApplies(centralId: string): Promise<boolean> {
    try {
        const { settings } = await loadAdversarialSettings()
        return adversaryAppliesTo(settings, centralId)
    } catch {
        return false
    }
}
