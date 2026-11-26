import { z } from "zod"
import { availability, loadFeature, persistFeature } from "@/features/ai/server/settings"
import { SECRETARY_FEATURE } from "../constants"
import { DEFAULT_SECRETARY_SETTINGS, secretarySettingsSchema, withSecretaryDefaults, type SecretarySettings } from "../schemas"

export function loadSecretarySettings() {
    return loadFeature(SECRETARY_FEATURE, z.preprocess(withSecretaryDefaults, secretarySettingsSchema), DEFAULT_SECRETARY_SETTINGS)
}

export async function getSecretarySettings() {
    const state = await loadSecretarySettings()
    return { settings: state.settings, updatedAt: state.updatedAt?.toISOString() ?? null }
}

export async function secretaryAvailability() {
    const { settings } = await loadSecretarySettings()
    return availability({ enabled: settings.enabled, provider: settings.main.provider, model: settings.main.model }, "Agente Secretário")
}

export async function saveSecretarySettings(settings: SecretarySettings, actor: string) {
    await persistFeature(SECRETARY_FEATURE, settings, actor, await loadSecretarySettings())
    return getSecretarySettings()
}
