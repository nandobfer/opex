"use client"

import { SHARED_MARKER_PREFIX } from "../shared-modules"
import type { PluginRuntimeEntry } from "../types"
import type { PluginClientModule } from "./sdk"
import { apiModule, SHARED_MODULE_LOADERS, type SharedModule } from "./shared-registry"
import type { PluginSource } from "./PluginSourceContext"

/**
 * Carregador do navegador (OPE-172). O bundle de uma versão (ESM do Rolldown) chega com os imports
 * compartilhados como marcadores `opex-shared:<id>`; aqui cada marcador vira um shim ESM (blob URL)
 * que reexporta a instância ÚNICA do shell — o plugin usa o mesmo React, Framer Motion, TanStack
 * Query e componentes do app. O código é importado fora do bundler do Next. Uma carga por revisão.
 */

type SharedTable = Record<string, SharedModule>
const TABLE_KEY = "__OPEX_SHARED__"
type GlobalWithTable = typeof globalThis & { [TABLE_KEY]?: SharedTable }

function sharedTable(): SharedTable {
    const g = globalThis as GlobalWithTable
    g[TABLE_KEY] ??= {}
    return g[TABLE_KEY]
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/
const shimUrls = new Map<string, string>()
const moduleCache = new Map<string, Promise<PluginClientModule>>()

/** Ids compartilhados que o bundle importa (marcadores). */
export function sharedImportsOf(code: string): string[] {
    const ids = new Set<string>()
    for (const match of code.matchAll(/["']opex-shared:([^"']+)["']/g)) ids.add(match[1]!)
    return [...ids]
}

/** Código ESM do shim de um módulo compartilhado (reexporta as chaves da instância do shell). */
export function shimSource(id: string, module: SharedModule): string {
    const names = Object.keys(module).filter((name) => name !== "default" && name !== "__esModule" && IDENTIFIER.test(name))
    const lines = [`const m = globalThis.${TABLE_KEY}[${JSON.stringify(id)}];`, "export default (m.default ?? m);"]
    if (names.length) lines.push(`export const { ${names.join(", ")} } = m;`)
    return lines.join("\n")
}

async function resolveShared(id: string, source: PluginSource): Promise<string> {
    const key = id === "@opex/api" ? `${id}|${source.kind}|${source.clientId ?? ""}` : id
    const cached = shimUrls.get(key)
    if (cached) return cached
    let shared: SharedModule
    if (id === "@opex/api") shared = apiModule(source.api)
    else {
        const loader = SHARED_MODULE_LOADERS[id]
        if (!loader) throw new Error(`Módulo compartilhado desconhecido: ${id}`)
        shared = await loader()
    }
    const tableId = key
    sharedTable()[tableId] = shared
    const url = URL.createObjectURL(new Blob([shimSource(tableId, shared)], { type: "text/javascript" }))
    shimUrls.set(key, url)
    return url
}

/** Troca os marcadores pelas URLs dos shims. */
export function linkSharedImports(code: string, urls: ReadonlyMap<string, string>): string {
    return code.replace(/(["'])opex-shared:([^"']+)\1/g, (whole, quote: string, id: string) => {
        const url = urls.get(id)
        return url ? `${quote}${url}${quote}` : whole
    })
}

async function fetchText(source: PluginSource, url: string): Promise<string> {
    const response = await source.api.get<string>(url, { responseType: "text", transformResponse: (value: unknown) => value })
    return String(response.data)
}

const importModule = (url: string): Promise<{ default?: unknown }> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)

async function load(entry: PluginRuntimeEntry, source: PluginSource): Promise<PluginClientModule> {
    if (!entry.bundleUrl) return {}
    const code = await fetchText(source, entry.bundleUrl)
    const urls = new Map<string, string>()
    for (const id of sharedImportsOf(code)) urls.set(id, await resolveShared(id, source))
    const blobUrl = URL.createObjectURL(new Blob([linkSharedImports(code, urls)], { type: "text/javascript" }))
    try {
        const mod = await importModule(blobUrl)
        const exported = (mod.default ?? {}) as PluginClientModule
        if (!exported || typeof exported !== "object") throw new Error("O cliente do plugin deve exportar por padrão { slots, pages }")
        return exported
    } finally {
        URL.revokeObjectURL(blobUrl)
    }
}

/** Módulo do cliente de uma revisão (cache: a mesma revisão nunca carrega duas vezes). */
export function loadPluginClient(entry: PluginRuntimeEntry, source: PluginSource): Promise<PluginClientModule> {
    const key = `${source.kind}|${source.clientId ?? ""}|${entry.id}|${entry.revision}`
    let pending = moduleCache.get(key)
    if (!pending) {
        pending = load(entry, source)
        pending.catch(() => moduleCache.delete(key))
        moduleCache.set(key, pending)
    }
    return pending
}

/** Injeta o CSS da revisão (um `<style>` por plugin; trocar de revisão substitui o anterior). */
export async function ensurePluginCss(entry: PluginRuntimeEntry, source: PluginSource): Promise<void> {
    if (typeof document === "undefined") return
    const id = `opex-plugin-css-${entry.id}`
    const existing = document.getElementById(id)
    if (existing?.getAttribute("data-revision") === entry.revision) return
    if (!entry.cssUrl) {
        existing?.remove()
        return
    }
    const css = await fetchText(source, entry.cssUrl)
    const style = existing ?? document.createElement("style")
    style.id = id
    style.setAttribute("data-revision", entry.revision)
    style.textContent = css
    if (!existing) document.head.appendChild(style)
}

/** Componente exportado pelo módulo (slot ou página). */
export function pluginExport(module: PluginClientModule, kind: "slots" | "pages", name: string): unknown {
    return module[kind]?.[name] ?? (module as Record<string, unknown>)[name] ?? null
}

export { SHARED_MARKER_PREFIX }
