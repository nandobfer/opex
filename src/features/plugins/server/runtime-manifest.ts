import { dbConnect } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { Plugin, PluginVersion, type IPlugin, type IPluginVersion } from "@/lib/db/models/Plugin"
import type { PluginComponentSlot } from "../constants"
import { resolvePluginVersion } from "../logic"
import type { PluginRuntimeEntry, PluginRuntimeManifestDto } from "../types"
import type { PluginAccess } from "./service"

/**
 * Manifesto de runtime do navegador (OPE-172): para cada plugin ativo do ator, a versão vigente
 * (`preview` se a prévia daquele plugin está ligada neste navegador, senão `stable`) com o endereço
 * imutável do bundle e o que ele contribui (slots, páginas e menu).
 */

type Lean<T> = T & { _id: { toString(): string } }

/** Base das rotas de bundle: dono `/plugins/bundles`, portal `/cliente/plugins/bundles` (relativas ao axios `/api`). */
export function bundlePaths(access: PluginAccess, versionId: string, version: Pick<IPluginVersion, "artifacts">) {
    const base = access.kind === "client" ? "/cliente/plugins/bundles" : "/plugins/bundles"
    const client = version.artifacts?.client
    return {
        bundleUrl: client ? `${base}/${versionId}/${client.hash}.js` : null,
        cssUrl: client?.css && client.cssHash ? `${base}/${versionId}/${client.cssHash}.css` : null,
    }
}

/**
 * Opções do manifesto do portal. `ownerPreview`: o dono pré-visualiza o portal com a sessão de admin;
 * aí só monta o plugin de cliente cuja prévia ELE ligou neste navegador (escolha explícita, depois de
 * revisar as fontes), nunca os plugins do cliente por padrão — o código do plugin roda no mesmo
 * origin, com a sessão do dono.
 */
export interface RuntimeManifestOptions {
    ownerPreview?: boolean
}

/** Plugin de cliente que pode rodar no navegador deste ator (o dono, só com a prévia ligada por ele). */
export function clientPluginMountable(pluginId: string, previewOn: readonly string[], options: RuntimeManifestOptions = {}): boolean {
    return !options.ownerPreview || previewOn.includes(pluginId)
}

export async function buildRuntimeManifest(access: PluginAccess, previewOn: string[], options: RuntimeManifestOptions = {}): Promise<PluginRuntimeManifestDto> {
    await dbConnect()
    const query: Record<string, unknown> = access.kind === "client" ? { scope: "client", clientId: access.clientId, active: true } : { scope: "owner", active: true }
    const found = (await Plugin.find(query).sort({ name: 1 }).lean()) as Lean<IPlugin>[]
    const plugins = access.kind === "client" ? found.filter((plugin) => clientPluginMountable(plugin.pluginId, previewOn, options)) : found
    const preview = new Set(previewOn)
    const chosen = plugins.map((plugin) => ({ plugin, resolved: resolvePluginVersion(plugin, preview.has(plugin.pluginId)) })).filter((item) => item.resolved)
    const ids = chosen.map((item) => item.resolved!.versionId)
    const versions = ids.length ? ((await PluginVersion.find({ _id: { $in: ids } }, { files: 0, "artifacts.server": 0, "artifacts.client.code": 0, "artifacts.client.css": 0 }).lean()) as unknown as Lean<IPluginVersion>[]) : []
    const byId = new Map(versions.map((version) => [String(version._id), version]))

    const entries: PluginRuntimeEntry[] = []
    for (const { plugin, resolved } of chosen) {
        const version = byId.get(resolved!.versionId)
        if (!version) continue
        const manifest = version.manifest
        const urls = bundlePaths(access, String(version._id), version)
        entries.push({
            id: plugin.pluginId,
            name: plugin.name,
            versionId: String(version._id),
            versionNumber: version.number,
            channel: resolved!.channel,
            revision: `${version.number}-${version.artifacts?.client?.hash ?? "server"}`,
            ...urls,
            slots: manifest.slots
                .filter((slot) => slot.slot !== "sidebar.nav")
                .map((slot) => ({ slot: slot.slot as PluginComponentSlot, export: slot.export, title: slot.title ?? null, order: slot.order })),
            pages: manifest.pages,
            nav: access.kind === "owner" ? manifest.nav : [],
        })
    }
    return { plugins: entries, previewOn: await visiblePreviewOn(access, previewOn) }
}

/**
 * Plugins com a prévia ligada neste navegador que o ator enxerga (a chave "Ligar prévia"): o dono
 * vê os de qualquer escopo (gerencia também os de cliente, ativos ou não); o portal, os do cliente.
 */
async function visiblePreviewOn(access: PluginAccess, previewOn: string[]): Promise<string[]> {
    if (!previewOn.length) return []
    const query: Record<string, unknown> = access.kind === "client" ? { scope: "client", clientId: access.clientId, pluginId: { $in: previewOn } } : { pluginId: { $in: previewOn } }
    const visible = new Set(((await Plugin.find(query, { pluginId: 1 }).lean()) as Lean<IPlugin>[]).map((plugin) => plugin.pluginId))
    return previewOn.filter((id) => visible.has(id))
}

/** Código ou CSS do bundle de uma versão (rota imutável). O portal só lê versões do próprio cliente. */
export async function readBundle(access: PluginAccess, versionId: string, file: string, mount: { previewOn: readonly string[]; options?: RuntimeManifestOptions } = { previewOn: [] }): Promise<{ body: string; contentType: string }> {
    const match = /^([0-9a-f]{16})\.(js|css)$/.exec(file)
    if (!match || !/^[a-f0-9]{24}$/.test(versionId)) throw new DomainError(404, "Bundle não encontrado", "PLUGIN_BUNDLE_NOT_FOUND")
    await dbConnect()
    const version = (await PluginVersion.findById(versionId, { pluginId: 1, "artifacts.client": 1 }).lean()) as Lean<IPluginVersion> | null
    const client = version?.artifacts?.client
    if (!version || !client) throw new DomainError(404, "Bundle não encontrado", "PLUGIN_BUNDLE_NOT_FOUND")
    const plugin = await Plugin.findOne({ pluginId: version.pluginId }, { scope: 1, clientId: 1 }).lean()
    if (!plugin) throw new DomainError(404, "Bundle não encontrado", "PLUGIN_BUNDLE_NOT_FOUND")
    if (access.kind === "client" ? plugin.scope !== "client" || plugin.clientId !== access.clientId : plugin.scope !== "owner") throw new DomainError(404, "Bundle não encontrado", "PLUGIN_BUNDLE_NOT_FOUND")
    if (access.kind === "client" && !clientPluginMountable(version.pluginId, mount.previewOn, mount.options)) throw new DomainError(404, "Bundle não encontrado", "PLUGIN_BUNDLE_NOT_FOUND")
    const [, hash, kind] = match
    if (kind === "js" && hash === client.hash) return { body: client.code, contentType: "text/javascript; charset=utf-8" }
    if (kind === "css" && client.css && hash === client.cssHash) return { body: client.css, contentType: "text/css; charset=utf-8" }
    throw new DomainError(404, "Bundle não encontrado", "PLUGIN_BUNDLE_NOT_FOUND")
}
