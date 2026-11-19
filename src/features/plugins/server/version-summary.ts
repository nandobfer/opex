import { dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { Plugin, PluginVersion, type IPluginVersion } from "@/lib/db/models/Plugin"
import { loggerFor } from "@/lib/logger"
import { PLUGIN_CHANGE_SUMMARY_MAX } from "../constants"
import { diffPluginFiles } from "../logic"
import { publishPluginUpdated } from "./service"

const log = loggerFor({ module: "plugins", feature: "version-summary" })

/** Teto da diferença enviada à IA (caracteres). */
const DIFF_PROMPT_MAX = 60_000

/** Limpa a resposta da IA: sem cercas de código nem aspas, uma única mensagem curta. */
export function cleanChangeSummary(text: string): string | null {
    const cleaned = text
        .replace(/```[a-z]*\n?/gi, "")
        .replace(/^["'\s]+|["'\s]+$/g, "")
        .trim()
    return cleaned ? cleaned.slice(0, PLUGIN_CHANGE_SUMMARY_MAX) : null
}

/** Entrada da IA: versão anterior (ou nenhuma) e a diferença das fontes, cortada no teto. */
export function buildChangeSummaryPrompt(input: { pluginName: string; fromNumber: number | null; toNumber: number; patches: string[] }): string {
    let diff = input.patches.join("\n")
    if (diff.length > DIFF_PROMPT_MAX) diff = `${diff.slice(0, DIFF_PROMPT_MAX)}\n[diferença cortada]`
    return [
        `Plugin: ${input.pluginName}`,
        input.fromNumber === null ? `Versão v${input.toNumber} (a primeira: descreva o que o plugin faz).` : `Mudança da versão v${input.fromNumber} para a v${input.toNumber}.`,
        "",
        "Diferença das fontes:",
        diff || "(sem diferença nas fontes)",
    ].join("\n")
}

/**
 * "Gerar descritivo" (OPE-172): escreve com IA, a partir da diferença para a versão anterior (número
 * menor), o que mudou na versão; grava com origem `ai`. Só por ação do dono (nenhuma leitura gera).
 */
export async function generateVersionChangeSummary(pluginId: string, versionId: string, actorId: string): Promise<{ changeSummary: string }> {
    const { availabilityOfPluginVersionSummary, loadPluginVersionSummarySettings } = await import("@/features/ai/server/settings")
    const { settings } = await loadPluginVersionSummarySettings()
    const availability = await availabilityOfPluginVersionSummary(settings)
    if (!availability.available || !settings.provider || !settings.model) throw new DomainError(409, availability.reason ?? 'Configure "Descritivo de versão de plugin" em Integrações › Inteligência Artificial', "AI_FEATURE_UNAVAILABLE")

    await dbConnect()
    const plugin = await Plugin.findOne({ pluginId }).lean()
    if (!plugin) throw new DomainError(404, "Plugin não encontrado", "PLUGIN_NOT_FOUND")
    const version = (await PluginVersion.findOne({ _id: versionId, pluginId }).lean()) as (IPluginVersion & { _id: unknown }) | null
    if (!version) throw new DomainError(404, "Versão não encontrada", "PLUGIN_VERSION_NOT_FOUND")
    const previous = (await PluginVersion.findOne({ pluginId, number: { $lt: version.number } }).sort({ number: -1 }).lean()) as IPluginVersion | null
    const patches = diffPluginFiles(previous?.files ?? [], version.files).map((file) => file.patch)

    const { streamAi } = await import("@/lib/ai/stream")
    let text = ""
    let error: string | null = null
    for await (const event of streamAi({
        provider: settings.provider,
        model: settings.model,
        variant: settings.variant,
        agent: settings.agent,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
        instructions: settings.instructions,
        title: `Descritivo de ${plugin.name} v${version.number}`,
        prompt: buildChangeSummaryPrompt({ pluginName: plugin.name, fromNumber: previous?.number ?? null, toNumber: version.number, patches }),
        consumption: { origin: "plugin-version-summary", subject: `${pluginId}:v${version.number}` },
    })) {
        if (event.type === "delta") text += event.text
        if (event.type === "error") error = event.message
    }
    const summary = error ? null : cleanChangeSummary(text)
    if (!summary) {
        log.warn({ pluginId, versionId, err: error ?? "resposta vazia" }, "[plugins] descritivo não gerado")
        throw new DomainError(502, `Não foi possível gerar o descritivo${error ? `: ${error}` : ""}`, "PLUGIN_SUMMARY_FAILED")
    }
    await PluginVersion.updateOne({ _id: versionId }, { $set: { changeSummary: summary, changeSummarySource: "ai" } })
    await recordAudit({ userId: actorId, entidade: "plugin", entidadeId: pluginId, acao: "ATUALIZAR", antes: { versao: version.number, descritivo: version.changeSummary ?? null }, depois: { versao: version.number, descritivo: summary, origem: "ai" } })
    await publishPluginUpdated(plugin, { version: version.number, channel: null })
    return { changeSummary: summary }
}
