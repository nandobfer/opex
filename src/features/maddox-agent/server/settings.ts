import { z } from "zod"
import { assertCatalog, availability, loadFeature, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import type { OpexToolMetaDto } from "@/features/opex-agent/tool-tree"
import { maddoxOwnerToolMetas } from "../catalog"
import { MADDOX_FEATURE } from "../constants"
import { DEFAULT_MADDOX_AGENT_SETTINGS, maddoxAgentSettingsSchema, type MaddoxAgentSettings } from "../schemas"
import type { MaddoxAgentSettingsDto } from "../types"

const log = loggerFor({ module: "maddox-agent" })

/** Ferramentas do dono para o Maddox (import dinâmico: o registro importa serviços pesados). */
export async function maddoxToolMetas(): Promise<OpexToolMetaDto[]> {
    const { opexToolMetas } = await import("@/features/opex-agent/server/tools/registry")
    return maddoxOwnerToolMetas(opexToolMetas())
}

/** Completa a configuração salva com os padrões dos campos novos antes de validar. */
export function withMaddoxDefaults(saved: unknown): unknown {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return saved
    const value = saved as Partial<MaddoxAgentSettings>
    return {
        ...DEFAULT_MADDOX_AGENT_SETTINGS,
        ...value,
        main: { ...DEFAULT_MADDOX_AGENT_SETTINGS.main, ...(value.main ?? {}) },
        title: { ...DEFAULT_MADDOX_AGENT_SETTINGS.title, ...(value.title ?? {}) },
        files: { ...DEFAULT_MADDOX_AGENT_SETTINGS.files, ...(value.files ?? {}) },
    }
}

export async function loadMaddoxSettings(): Promise<{ settings: MaddoxAgentSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature<MaddoxAgentSettings>(MADDOX_FEATURE, z.preprocess(withMaddoxDefaults, maddoxAgentSettingsSchema), DEFAULT_MADDOX_AGENT_SETTINGS)
}

/** Disponível = ativo + OpenCode conectado + modelo escolhido. */
export async function maddoxAvailability(settings: MaddoxAgentSettings): Promise<AiFeatureAvailability> {
    if (settings.enabled && !settings.main.model) return { available: false, reason: "Selecione o modelo do Agente Maddox em Integrações › Inteligência Artificial › Agente Maddox" }
    return availability({ enabled: settings.enabled, provider: "opencode", model: settings.main.model }, '"Agente Maddox"')
}

/** Rótulo do modelo no cabeçalho do chat. */
export function maddoxModelLabel(model: string | null, variant?: string | null): string | null {
    if (!model) return null
    return `OpenCode · ${model}${variant ? ` (${variant})` : ""}`
}

export async function getMaddoxSettings(): Promise<MaddoxAgentSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadMaddoxSettings()
    return { settings, isDefault, availability: await maddoxAvailability(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null, tools: await maddoxToolMetas() }
}

/** Normaliza (variantes vazias, contexto sempre ligado) e recusa ferramentas fora do catálogo. */
export function normalizeMaddoxSettings(input: MaddoxAgentSettings, metas: readonly OpexToolMetaDto[] = []): MaddoxAgentSettings {
    const known = new Map(metas.map((tool) => [tool.name, tool]))
    if (metas.length) {
        const unknown = [...input.disabledTools, ...Object.keys(input.confirmationOverrides)].find((name) => !known.has(name))
        if (unknown) throw new DomainError(400, `Ferramenta desconhecida: ${unknown}`, "MADDOX_TOOL_NOT_FOUND")
    }
    return {
        ...input,
        main: { model: input.main.model || null, variant: input.main.model ? input.main.variant || null : null },
        title: { model: input.title.model || null, variant: input.title.model ? input.title.variant || null : null },
        mcpBaseUrl: input.mcpBaseUrl ? input.mcpBaseUrl.replace(/\/+$/, "") : null,
        disabledTools: [...new Set(input.disabledTools)].filter((name) => !known.get(name)?.alwaysOn),
    }
}

/** Confere no catálogo do OpenCode o modelo e a variante (do agente e do subagente de título). */
async function assertMaddoxCatalog(settings: MaddoxAgentSettings): Promise<void> {
    await assertCatalog({ enabled: settings.enabled, provider: "opencode", model: settings.main.model, variant: settings.main.variant, agent: null, temperature: null, maxOutputTokens: null })
    if (settings.title.model) {
        await assertCatalog({ enabled: settings.enabled, provider: "opencode", model: settings.title.model, variant: settings.title.variant, agent: null, temperature: null, maxOutputTokens: null })
    }
}

/**
 * Salva (auditado pelo `persistFeature`), registra de novo os MCPs do Opex no OpenCode com a URL atual e
 * avisa o portal dos clientes com o Maddox ligado (cor e disponibilidade mudam lá também).
 */
export async function saveMaddoxSettings(input: MaddoxAgentSettings, actorId: string): Promise<MaddoxAgentSettingsDto> {
    const next = normalizeMaddoxSettings(input, await maddoxToolMetas())
    await assertMaddoxCatalog(next)
    const before = await loadMaddoxSettings()
    await persistFeature(MADDOX_FEATURE, next, actorId, before)
    if (next.enabled) {
        try {
            const { getOpencodeClient } = await import("@/lib/ai/opencode-client")
            const { ensureMaddoxMcp, maddoxDirectory } = await import("./opencode-session")
            const result = await ensureMaddoxMcp(await getOpencodeClient(), await maddoxDirectory(), next.mcpBaseUrl, { force: next.mcpBaseUrl !== before.settings.mcpBaseUrl })
            if (!result.ok) log.warn({ err: result.error }, "[maddox] MCP do Opex não registrado ao salvar")
        } catch (error) {
            log.warn({ err: error instanceof Error ? error.message : error }, "[maddox] MCP do Opex não registrado ao salvar")
        }
    }
    const { publishMaddoxSettingsToClients } = await import("./client-config")
    await publishMaddoxSettingsToClients()
    return getMaddoxSettings()
}
