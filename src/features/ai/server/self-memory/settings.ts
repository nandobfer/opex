import { z } from "zod"
import type { MemoryConsumer } from "../../agents"
import { DEFAULT_SELF_MEMORY_SETTINGS, SELF_MEMORY_FEATURE, selfMemorySettingsSchema, type SelfMemorySettings } from "../../self-memory"
import { loadFeature, persistFeature } from "../settings"

/** Chave "Aprendizado autônomo" por agente (`ai_feature_settings`, auditada como as demais). */

/** Configuração salva antes de um agente novo existir recebe o padrão dele (os demais continuam). */
export function withSelfMemoryDefaults(saved: unknown): unknown {
    return saved && typeof saved === "object" && !Array.isArray(saved) ? { ...DEFAULT_SELF_MEMORY_SETTINGS, ...saved } : saved
}

export function loadSelfMemorySettings() {
    return loadFeature<SelfMemorySettings>(SELF_MEMORY_FEATURE, z.preprocess(withSelfMemoryDefaults, selfMemorySettingsSchema), DEFAULT_SELF_MEMORY_SETTINGS)
}

export async function getSelfMemorySettings(): Promise<{ settings: SelfMemorySettings; updatedAt: string | null }> {
    const { settings, updatedAt } = await loadSelfMemorySettings()
    return { settings, updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export async function saveSelfMemorySettings(input: SelfMemorySettings, actorId: string): Promise<{ settings: SelfMemorySettings; updatedAt: string | null }> {
    const before = await loadSelfMemorySettings()
    await persistFeature(SELF_MEMORY_FEATURE, input, actorId, before)
    return getSelfMemorySettings()
}

/** O agente aprende sozinho? Na dúvida (banco fora), sim. */
export async function selfMemoryEnabled(consumer: MemoryConsumer): Promise<boolean> {
    try {
        return (await loadSelfMemorySettings()).settings[consumer]
    } catch {
        return DEFAULT_SELF_MEMORY_SETTINGS[consumer]
    }
}
