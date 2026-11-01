import { z } from "zod"
import { assertCatalog, availability, loadFeature, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { loggerFor } from "@/lib/logger"
import { ARCHITECT_FEATURE } from "../constants"
import { DEFAULT_ARCHITECT_SETTINGS, architectSettingsSchema, type ArchitectSettings } from "../schemas"
import type { ArchitectSettingsDto } from "../types"

const log = loggerFor({ module: "architect-agent" })

/** Configuração salva antes de um campo novo existir recebe o padrão dele antes de validar. */
export function withDefaults(saved: unknown): unknown {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return saved
    const value = saved as Partial<ArchitectSettings>
    const defaults = DEFAULT_ARCHITECT_SETTINGS
    return {
        ...defaults,
        ...value,
        scope: { ...defaults.scope, ...(value.scope ?? {}) },
        diagram: { ...defaults.diagram, ...(value.diagram ?? {}) },
    }
}

export async function loadArchitectSettings(): Promise<{ settings: ArchitectSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature<ArchitectSettings>(ARCHITECT_FEATURE, z.preprocess(withDefaults, architectSettingsSchema), DEFAULT_ARCHITECT_SETTINGS)
}

/** Exclusivo do OpenCode (sessão com ferramentas de leitura do repositório). */
export async function architectAvailability(settings: ArchitectSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: "opencode", model: settings.agent.model }, '"Agente Arquiteto"')
}

export async function getArchitectSettings(): Promise<ArchitectSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadArchitectSettings()
    return { settings, isDefault, availability: await architectAvailability(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export function normalizeArchitectSettings(input: ArchitectSettings): ArchitectSettings {
    return {
        ...input,
        agent: { ...input.agent, agent: input.agent.agent || null, variant: input.agent.variant || null },
        scope: { all: input.scope.all, centralIds: input.scope.all ? [] : [...new Set(input.scope.centralIds)] },
        diagram: { ...input.diagram, nodeKinds: [...new Set(input.diagram.nodeKinds)] },
    }
}

/** Salva conferindo no catálogo o modelo do arquiteto (OpenCode). */
export async function saveArchitectSettings(input: ArchitectSettings, actorId: string): Promise<ArchitectSettingsDto> {
    const next = normalizeArchitectSettings(input)
    await assertCatalog({ enabled: next.enabled, provider: "opencode", model: next.agent.model, agent: next.agent.agent, variant: next.agent.variant, temperature: null, maxOutputTokens: null })
    const before = await loadArchitectSettings()
    await persistFeature(ARCHITECT_FEATURE, next, actorId, before)
    return getArchitectSettings()
}

/** O arquiteto vale para as mesas desta central? Ativo e a central no escopo. */
export function settingsApply(settings: ArchitectSettings, centralId: string): boolean {
    return settings.enabled && (settings.scope.all || settings.scope.centralIds.includes(centralId))
}

/** Nunca lança: na dúvida (configuração ilegível), o arquiteto não se aplica (com aviso no log). */
export async function architectApplies(centralId: string): Promise<boolean> {
    try {
        return settingsApply((await loadArchitectSettings()).settings, centralId)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), centralId }, "[architect] configuração ilegível: o arquiteto não se aplica")
        return false
    }
}
