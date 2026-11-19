import { createTwoFilesPatch } from "diff"
import type { PluginChannel, PluginVersionState } from "./constants"
import type { PluginSourceFile } from "./manifest"

/** Regras puras dos plugins (OPE-172): ciclo das versões, escolha stable/preview e diff. */

export interface PluginPointers {
    active: boolean
    stableVersionId: string | null
    previewVersionId: string | null
}

export interface ResolvedPluginVersion {
    versionId: string
    channel: PluginChannel
}

/**
 * Versão que um ator vê: a `preview` quando a prévia do plugin está ligada (cookie) e existe; senão a
 * `stable`. Plugin desativado ou sem versão publicada não aparece.
 */
export function resolvePluginVersion(plugin: PluginPointers, previewOn: boolean): ResolvedPluginVersion | null {
    if (!plugin.active) return null
    if (previewOn && plugin.previewVersionId) return { versionId: plugin.previewVersionId, channel: "preview" }
    if (plugin.stableVersionId) return { versionId: plugin.stableVersionId, channel: "stable" }
    return null
}

export const PLUGIN_VERSION_ACTIONS = ["publish-preview", "consolidate", "rollback", "discard-preview"] as const
export type PluginVersionAction = (typeof PLUGIN_VERSION_ACTIONS)[number]

/** Estado exigido da versão-alvo por ação (ciclo `draft` → `preview` → `stable`; rollback volta a uma anterior). */
const REQUIRED_STATE: Record<PluginVersionAction, readonly PluginVersionState[]> = {
    "publish-preview": ["draft", "preview"],
    consolidate: ["preview"],
    rollback: ["archived", "stable"],
    "discard-preview": ["preview"],
}

/** Mensagem pt-BR quando a ação não vale para a versão; `null` quando pode. */
export function versionActionBlock(action: PluginVersionAction, state: PluginVersionState, context: { isCurrentStable?: boolean } = {}): string | null {
    if (!REQUIRED_STATE[action].includes(state)) {
        const labels: Record<PluginVersionAction, string> = {
            "publish-preview": "Só um rascunho pode virar prévia",
            consolidate: "Só a versão em prévia pode ser consolidada",
            rollback: "O rollback só volta para uma versão já consolidada antes",
            "discard-preview": "A versão não está em prévia",
        }
        return labels[action]
    }
    if (action === "rollback" && context.isCurrentStable) return "Esta já é a versão estável atual"
    return null
}

export type FileDiffStatus = "added" | "removed" | "modified"

export interface PluginFileDiff {
    path: string
    status: FileDiffStatus
    additions: number
    deletions: number
    /** Diff unificado do arquivo. */
    patch: string
}

/** Diff por arquivo entre duas versões (só os arquivos alterados, em ordem de caminho). */
export function diffPluginFiles(from: PluginSourceFile[], to: PluginSourceFile[]): PluginFileDiff[] {
    const before = new Map(from.map((file) => [file.path, file.content]))
    const after = new Map(to.map((file) => [file.path, file.content]))
    const paths = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a.localeCompare(b))
    const result: PluginFileDiff[] = []
    for (const path of paths) {
        const oldContent = before.get(path)
        const newContent = after.get(path)
        if (oldContent === newContent) continue
        const status: FileDiffStatus = oldContent === undefined ? "added" : newContent === undefined ? "removed" : "modified"
        const patch = createTwoFilesPatch(`a/${path}`, `b/${path}`, oldContent ?? "", newContent ?? "", undefined, undefined, { context: 3 })
        let additions = 0
        let deletions = 0
        for (const line of patch.split("\n")) {
            if (line.startsWith("+") && !line.startsWith("+++")) additions++
            else if (line.startsWith("-") && !line.startsWith("---")) deletions++
        }
        result.push({ path, status, additions, deletions, patch })
    }
    return result
}

/** Diff inteiro em texto (para o Agente Adversário e as ferramentas). */
export function diffAsText(diffs: PluginFileDiff[]): string {
    return diffs.map((diff) => diff.patch).join("\n")
}

/** Lista de plugins com a prévia ligada (valor do cookie, antes da assinatura). */
export function parsePreviewList(value: string | null | undefined): string[] {
    if (!value) return []
    return [...new Set(value.split(",").map((id) => id.trim()).filter((id) => /^[a-z][a-z0-9-]{1,39}$/.test(id)))].slice(0, 50)
}

export function togglePreviewList(list: string[], pluginId: string, on: boolean): string[] {
    const next = list.filter((id) => id !== pluginId)
    return on ? [...next, pluginId] : next
}

/** Slug do id do plugin a partir de um título (sem acentos, minúsculas, `-`). */
export function pluginIdFromTitle(title: string): string {
    const slug = title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 36)
        .replace(/-+$/g, "")
    const withLetter = /^[a-z]/.test(slug) ? slug : `p-${slug}`
    return withLetter.length >= 2 ? withLetter : "plugin"
}

/** Id livre: acrescenta sufixo numérico quando já existe. */
export function uniquePluginId(base: string, taken: ReadonlySet<string>): string {
    if (!taken.has(base)) return base
    for (let n = 2; n < 1000; n++) {
        const candidate = `${base.slice(0, 36)}-${n}`
        if (!taken.has(candidate)) return candidate
    }
    return `${base.slice(0, 30)}-${Date.now().toString(36)}`
}
