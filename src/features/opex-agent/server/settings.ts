import { z } from "zod"
import { assertCatalog, availability, loadFeature, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { getAiProvider } from "@/lib/ai/providers"
import { OPEX_FEATURE, OPEX_TOOL_GROUPS, type OpexToolGroup } from "../constants"
import { DEFAULT_OPEX_AGENT_SETTINGS, opexAgentSettingsSchema, type OpexAgentSettings, type OpexMainModel, type OpexTitleModel } from "../schemas"
import type { OpexAgentSettingsDto } from "../types"

export async function loadOpexSettings(): Promise<{ settings: OpexAgentSettings; isDefault: boolean; updatedAt: Date | null }> {
    // Configurações salvas antes de um campo novo existir recebem o padrão dele antes de validar.
    return loadFeature<OpexAgentSettings>(OPEX_FEATURE, z.preprocess(withDefaults, opexAgentSettingsSchema), DEFAULT_OPEX_AGENT_SETTINGS)
}

/** Completa a configuração salva com os padrões dos campos novos (grupos de ferramentas novos nascem ligados). */
export function withDefaults(saved: unknown): unknown {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return saved
    const value = saved as Partial<OpexAgentSettings>
    return {
        ...DEFAULT_OPEX_AGENT_SETTINGS,
        ...value,
        toolGroups: { ...DEFAULT_OPEX_AGENT_SETTINGS.toolGroups, ...(value.toolGroups ?? {}) },
        files: { ...DEFAULT_OPEX_AGENT_SETTINGS.files, ...(value.files ?? {}) },
    }
}

export async function opexAvailability(settings: OpexAgentSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: settings.main.provider, model: settings.main.model }, '"Agente Opex"')
}

async function toolCounts(): Promise<Record<OpexToolGroup, number>> {
    const { OPEX_TOOLS } = await import("./tools/registry")
    return Object.fromEntries(OPEX_TOOL_GROUPS.map((group) => [group, OPEX_TOOLS.filter((tool) => tool.group === group).length])) as Record<OpexToolGroup, number>
}

export async function getOpexSettings(): Promise<OpexAgentSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadOpexSettings()
    return { settings, isDefault, availability: await opexAvailability(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null, toolCounts: await toolCounts() }
}

function normalizeMain(main: OpexMainModel): OpexMainModel {
    const supportsSampling = main.provider ? getAiProvider(main.provider).supportsSampling : false
    return {
        ...main,
        variant: main.variant || null,
        temperature: supportsSampling ? main.temperature : null,
        maxOutputTokens: supportsSampling ? main.maxOutputTokens : null,
    }
}

function normalizeTitle(title: OpexTitleModel): OpexTitleModel {
    if (!title.provider) return { provider: null, model: null, variant: null }
    return { ...title, variant: title.variant || null }
}

export function normalizeOpexSettings(input: OpexAgentSettings): OpexAgentSettings {
    return { ...input, main: normalizeMain(input.main), title: normalizeTitle(input.title) }
}

/** Salva conferindo no catálogo os modelos e variantes do agente e do subagente de título. */
export async function saveOpexSettings(input: OpexAgentSettings, actorId: string): Promise<OpexAgentSettingsDto> {
    const next = normalizeOpexSettings(input)
    await assertCatalog({ enabled: next.enabled, provider: next.main.provider, model: next.main.model, variant: next.main.variant, agent: null, temperature: null, maxOutputTokens: null })
    if (next.title.provider) {
        await assertCatalog({ enabled: next.enabled, provider: next.title.provider, model: next.title.model, variant: next.title.variant, agent: null, temperature: null, maxOutputTokens: null })
    }
    const before = await loadOpexSettings()
    await persistFeature(OPEX_FEATURE, next, actorId, before)
    return getOpexSettings()
}
