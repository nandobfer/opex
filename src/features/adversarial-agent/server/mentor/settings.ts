import { z } from "zod"
import { assertCatalog, availability, loadFeature, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { MENTOR_FEATURE } from "../../mentor/constants"
import { DEFAULT_MENTOR_SETTINGS, enabledTargets, mentorSettingsSchema, type MentorSettings } from "../../mentor/schemas"
import type { MentorSettingsDto } from "../../mentor/types"
import { loadAdversarialSettings } from "../settings"

/**
 * Configuração salva antes de um campo novo existir recebe o padrão dele antes de validar. O Triador
 * (OPE-97) de uma configuração antiga nasce com o provedor e o modelo do decisor, para o Mentor seguir
 * funcionando sem ação do dono.
 */
export function withMentorDefaults(saved: unknown): unknown {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return saved
    const value = saved as Partial<MentorSettings>
    const defaults = DEFAULT_MENTOR_SETTINGS
    return {
        ...defaults,
        ...value,
        scope: { ...defaults.scope, ...(value.scope ?? {}) },
        triggers: {
            user: { ...defaults.triggers.user, ...(value.triggers?.user ?? {}) },
            ai: { ...defaults.triggers.ai, ...(value.triggers?.ai ?? {}) },
            developer: {
                ...defaults.triggers.developer,
                ...(value.triggers?.developer ?? {}),
                stages: { ...defaults.triggers.developer.stages, ...(value.triggers?.developer?.stages ?? {}) },
            },
        },
        decider: { ...defaults.decider, ...(value.decider ?? {}) },
        router: value.router ? { ...defaults.router, ...value.router } : { ...defaults.router, ...(value.decider ?? {}), instructions: "" },
        targets: { ...defaults.targets, ...(value.targets ?? {}) },
        writer: { ...defaults.writer, ...(value.writer ?? {}) },
        context: { ...defaults.context, ...(value.context ?? {}) },
    }
}

export async function loadMentorSettings(): Promise<{ settings: MentorSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature<MentorSettings>(MENTOR_FEATURE, z.preprocess(withMentorDefaults, mentorSettingsSchema), DEFAULT_MENTOR_SETTINGS)
}

/** Pode rodar? Mentor ativo, Agente Adversário ativo e os modelos (decisor, Triador quando há mais de um destino, redator) conectados. */
export async function mentorAvailability(settings: MentorSettings, adversaryEnabled: boolean): Promise<AiFeatureAvailability> {
    if (settings.enabled && !adversaryEnabled) return { available: false, reason: "O Agente Mentor grava memórias do Agente Adversário: ative o Agente Adversário na aba dele" }
    const decider = await availability({ enabled: settings.enabled, provider: settings.decider.provider, model: settings.decider.model }, '"Agente Mentor"')
    if (!decider.available) return decider
    if (enabledTargets(settings.targets).length > 1) {
        const router = await availability({ enabled: settings.enabled, provider: settings.router.provider, model: settings.router.model }, '"Agente Mentor" (Triador)')
        if (!router.available) return router
    }
    return availability({ enabled: settings.enabled, provider: settings.writer.provider, model: settings.writer.model }, '"Agente Mentor"')
}

export async function getMentorSettings(): Promise<MentorSettingsDto> {
    const [{ settings, isDefault, updatedAt }, adversary] = await Promise.all([loadMentorSettings(), loadAdversarialSettings()])
    return { settings, isDefault, availability: await mentorAvailability(settings, adversary.settings.enabled), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export function normalizeMentorSettings(input: MentorSettings): MentorSettings {
    const model = <T extends { provider: unknown; model: string | null; variant: string | null }>(value: T): T => (value.provider ? { ...value, variant: value.variant || null } : { ...value, provider: null, model: null, variant: null })
    return {
        ...input,
        scope: { all: input.scope.all, centralIds: input.scope.all ? [] : [...new Set(input.scope.centralIds)] },
        decider: model(input.decider),
        router: model(input.router),
        writer: model(input.writer),
    }
}

/** Salva conferindo no catálogo os modelos do decisor, do Triador e do redator. */
export async function saveMentorSettings(input: MentorSettings, actorId: string): Promise<MentorSettingsDto> {
    const next = normalizeMentorSettings(input)
    for (const part of [next.decider, next.router, next.writer]) {
        if (part.provider) await assertCatalog({ enabled: next.enabled, provider: part.provider, model: part.model, agent: null, variant: part.variant, temperature: null, maxOutputTokens: null })
    }
    const before = await loadMentorSettings()
    await persistFeature(MENTOR_FEATURE, next, actorId, before)
    return getMentorSettings()
}

/**
 * Configuração do Mentor quando ele vale para a central: Agente Adversário ativo, Mentor ativo e a
 * central no escopo. `null` caso contrário. Nunca lança (na dúvida, a mesa segue sem ele).
 */
export async function mentorSettingsFor(centralId: string): Promise<MentorSettings | null> {
    try {
        const [{ settings }, adversary] = await Promise.all([loadMentorSettings(), loadAdversarialSettings()])
        if (!settings.enabled || !adversary.settings.enabled) return null
        return settings.scope.all || settings.scope.centralIds.includes(centralId) ? settings : null
    } catch {
        return null
    }
}
