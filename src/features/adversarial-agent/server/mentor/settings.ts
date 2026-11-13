import { z } from "zod"
import { assertCatalog, availability, loadFeature, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { MENTOR_FEATURE } from "../../mentor/constants"
import { DEFAULT_MENTOR_SETTINGS, effectiveTargets, mentorSettingsSchema, type MentorSettings } from "../../mentor/schemas"
import type { MentorSettingsDto } from "../../mentor/types"
import { loadAdversarialSettings } from "../settings"

/**
 * Configuração salva antes de um campo novo existir recebe o padrão dele antes de validar. O Triador
 * (OPE-97) de uma configuração antiga nasce com o provedor e o modelo do decisor; o digestor (OPE-165),
 * com o provedor e o modelo do redator. Os campos que saíram na OPE-165 (`triggers`, `context`,
 * `saveMode`) são descartados.
 */
export function withMentorDefaults(saved: unknown): unknown {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return saved
    const value = { ...(saved as Partial<MentorSettings>) }
    for (const legacy of ["triggers", "context", "saveMode"]) delete (value as Record<string, unknown>)[legacy]
    const defaults = DEFAULT_MENTOR_SETTINGS
    const writer = { ...defaults.writer, ...(value.writer ?? {}) }
    return {
        ...defaults,
        ...value,
        scope: { ...defaults.scope, ...(value.scope ?? {}) },
        digest: value.digest ? { ...defaults.digest, ...value.digest } : { ...defaults.digest, provider: writer.provider, model: writer.model, variant: writer.variant },
        decider: { ...defaults.decider, ...(value.decider ?? {}) },
        router: value.router ? { ...defaults.router, ...value.router } : { ...defaults.router, ...(value.decider ?? {}), instructions: "" },
        targets: { ...defaults.targets, ...(value.targets ?? {}) },
        writer,
    }
}

export async function loadMentorSettings(): Promise<{ settings: MentorSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature<MentorSettings>(MENTOR_FEATURE, z.preprocess(withMentorDefaults, mentorSettingsSchema), DEFAULT_MENTOR_SETTINGS)
}

/**
 * Pode rodar? Mentor ativo e os modelos (digestor, decisor, Triador quando há mais de um destino que vale
 * e redator) conectados. Desde a OPE-165 o Agente Adversário só é exigido para o destino dele: sem ele,
 * o Mentor segue com as listas do desenvolvedor (o aviso aparece, mas não bloqueia).
 */
export async function mentorAvailability(settings: MentorSettings, adversaryEnabled: boolean): Promise<AiFeatureAvailability> {
    const targets = effectiveTargets(settings.targets, adversaryEnabled)
    if (settings.enabled && !targets.length) return { available: false, reason: "O único destino ligado é o Agente Adversário, que está desativado: ative-o ou ligue uma lista do desenvolvedor" }
    const digest = await availability({ enabled: settings.enabled, provider: settings.digest.provider, model: settings.digest.model }, '"Agente Mentor" (digestor)')
    if (!digest.available) return digest
    const decider = await availability({ enabled: settings.enabled, provider: settings.decider.provider, model: settings.decider.model }, '"Agente Mentor"')
    if (!decider.available) return decider
    if (targets.length > 1) {
        const router = await availability({ enabled: settings.enabled, provider: settings.router.provider, model: settings.router.model }, '"Agente Mentor" (Triador)')
        if (!router.available) return router
    }
    const writer = await availability({ enabled: settings.enabled, provider: settings.writer.provider, model: settings.writer.model }, '"Agente Mentor"')
    if (!writer.available) return writer
    if (settings.enabled && settings.targets.adversarial && !adversaryEnabled) return { available: true, reason: "O Agente Adversário está desativado: o Mentor grava só nas listas do desenvolvedor até ele voltar" }
    return writer
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
        digest: model(input.digest),
        decider: model(input.decider),
        router: model(input.router),
        writer: model(input.writer),
    }
}

/** Salva conferindo no catálogo os modelos do digestor, do decisor, do Triador e do redator. */
export async function saveMentorSettings(input: MentorSettings, actorId: string): Promise<MentorSettingsDto> {
    const next = normalizeMentorSettings(input)
    for (const part of [next.digest, next.decider, next.router, next.writer]) {
        if (part.provider) await assertCatalog({ enabled: next.enabled, provider: part.provider, model: part.model, agent: null, variant: part.variant, temperature: null, maxOutputTokens: null })
    }
    const before = await loadMentorSettings()
    await persistFeature(MENTOR_FEATURE, next, actorId, before)
    return getMentorSettings()
}

/**
 * Configuração do Mentor quando ele aprende na central (OPE-165): Mentor ativo, aprendizado na conclusão
 * ligado e a central no escopo — o Agente Adversário NÃO é exigido. `null` caso contrário. Nunca lança (na
 * dúvida, a mesa segue sem ele).
 */
export async function mentorSettingsFor(centralId: string): Promise<MentorSettings | null> {
    try {
        const { settings } = await loadMentorSettings()
        if (!settings.enabled || !settings.learnOnDone) return null
        return settings.scope.all || settings.scope.centralIds.includes(centralId) ? settings : null
    } catch {
        return null
    }
}
