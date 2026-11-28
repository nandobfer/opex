import { z } from "zod"
import { assertCatalog, availability, loadFeature, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { getIntegrationConfig } from "@/lib/integrations/runtime"
import { PROJECT_BOOTSTRAP_FEATURE, PROJECT_BOOTSTRAP_SETTINGS_HREF } from "../constants"
import { DEFAULT_PROJECT_BOOTSTRAP_SETTINGS, projectBootstrapSettingsSchema, type ProjectBootstrapSettings } from "../schemas"
import type { BootstrapBlocker, ProjectBootstrapSettingsDto } from "../types"

/** Configuração salva antes de um campo novo existir recebe o padrão dele antes de validar. */
function withDefaults(saved: unknown): unknown {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return saved
    return { ...DEFAULT_PROJECT_BOOTSTRAP_SETTINGS, ...(saved as Partial<ProjectBootstrapSettings>) }
}

export async function loadProjectBootstrapSettings(): Promise<{ settings: ProjectBootstrapSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature<ProjectBootstrapSettings>(PROJECT_BOOTSTRAP_FEATURE, z.preprocess(withDefaults, projectBootstrapSettingsSchema), DEFAULT_PROJECT_BOOTSTRAP_SETTINGS)
}

/** Provedor fixo: OpenCode no host. */
export async function projectBootstrapAgentAvailability(settings: ProjectBootstrapSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: "opencode", model: settings.agent.model }, '"Agente de Bootstrap"')
}

export async function getProjectBootstrapSettings(): Promise<ProjectBootstrapSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadProjectBootstrapSettings()
    return { settings, isDefault, availability: await projectBootstrapAgentAvailability(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export function normalizeProjectBootstrapSettings(input: ProjectBootstrapSettings): ProjectBootstrapSettings {
    return {
        ...input,
        agent: { ...input.agent, agent: input.agent.agent || null, variant: input.agent.variant || null },
        skills: [...new Set(input.skills.map((skill) => skill.trim()).filter(Boolean))],
        environmentSkills: [...new Set(input.environmentSkills.map((skill) => skill.trim()).filter(Boolean))],
    }
}

/** Salva conferindo no catálogo do OpenCode o agente, o modelo, a variante e os fallbacks. */
export async function saveProjectBootstrapSettings(input: ProjectBootstrapSettings, actorId: string): Promise<ProjectBootstrapSettingsDto> {
    const next = normalizeProjectBootstrapSettings(input)
    await assertCatalog({ enabled: next.enabled, provider: "opencode", model: next.agent.model, agent: next.agent.agent, variant: next.agent.variant, temperature: null, maxOutputTokens: null }, next.agent.fallbacks ?? [])
    const before = await loadProjectBootstrapSettings()
    await persistFeature(PROJECT_BOOTSTRAP_FEATURE, next, actorId, before)
    return getProjectBootstrapSettings()
}

/**
 * Motivos que bloqueiam o envio da etapa 1, cada um com o caminho para resolver: o agente desativado
 * (ou sem modelo), o OpenCode desconectado e o token do GitHub ausente.
 */
export async function projectBootstrapBlockers(): Promise<BootstrapBlocker[]> {
    const blockers: BootstrapBlocker[] = []
    const { settings } = await loadProjectBootstrapSettings()
    if (!settings.enabled) blockers.push({ message: "O Agente de Bootstrap está desativado.", href: PROJECT_BOOTSTRAP_SETTINGS_HREF, action: "Configurar o Agente de Bootstrap" })
    else if (!settings.agent.model) blockers.push({ message: "O Agente de Bootstrap está sem modelo.", href: PROJECT_BOOTSTRAP_SETTINGS_HREF, action: "Escolher o modelo" })
    else {
        const agent = await projectBootstrapAgentAvailability(settings)
        if (!agent.available) blockers.push({ message: agent.reason ?? "O OpenCode não está conectado.", href: "/integracoes/ia/opencode", action: "Abrir o OpenCode" })
    }
    const github = await getIntegrationConfig("github").catch(() => null)
    if (!github?.token) blockers.push({ message: "O token do GitHub não está configurado.", href: "/integracoes/github", action: "Configurar o GitHub" })
    return blockers
}
