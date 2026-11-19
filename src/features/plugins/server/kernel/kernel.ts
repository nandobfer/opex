import { mkdir, writeFile, access } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { PLUGIN_API_VERSION, PLUGIN_SERVICES, type PluginChannel } from "../../constants"
import { checkPluginApiVersion, type PluginManifest } from "../../manifest"
import { isPreviewInstance } from "@/lib/instance"
import { loggerFor } from "@/lib/logger"
import { createRootContext, effectLabels, type Context, type Fiber, type PluginComponent } from "./cordis"
import { markPluginFiber } from "./identity"
import { pluginRegistries } from "./registries"
import { CORE_SERVICES } from "./services"

/**
 * Kernel de plugins do dono (OPE-172), sobre o Cordis. Instância ÚNICA em `globalThis` (como o cache
 * do Mongoose): o `register()` do `instrumentation.ts` sobe o kernel e as rotas do Next reaproveitam.
 *
 * Cada plugin ativo tem até duas fibers: a da `stable` e a da `preview` (prévia de uma mesa). A
 * recarga é TRANSACIONAL: a versão nova é importada e ativada numa fiber nova; só se der certo a
 * antiga é descartada (`dispose` desfaz rotas, ferramentas e crons dela). Falha de um plugin nunca
 * afeta outro nem derruba o app.
 *
 * Instância de prévia do app (`OPEX_PREVIEW=1`, mesmo Mongo da produção): o código de servidor dos
 * plugins NÃO é ativado (`mode: "preview-instance"`), para não duplicar crons e efeitos da produção.
 */

const log = () => loggerFor({ module: "plugins.kernel" })

/** Teto técnico da importação + ativação de uma versão. */
export const PLUGIN_ACTIVATION_TIMEOUT_MS = 30_000

export type KernelMode = "full" | "preview-instance"

export interface LoadedFiber {
    pluginId: string
    channel: PluginChannel
    versionId: string
    hash: string
    fiber: Fiber
    fiberId: string
    activatedAt: Date
    warning: string | null
}

interface KernelState {
    root: Context
    mode: KernelMode
    fibers: Map<string, LoadedFiber>
    locks: Map<string, Promise<unknown>>
    seq: number
    started: boolean
}

const KEY = "__opexPluginKernel"
type GlobalWithKernel = typeof globalThis & { [KEY]?: Promise<KernelState> }

const fiberKey = (pluginId: string, channel: PluginChannel) => `${pluginId}|${channel}`

async function createKernel(): Promise<KernelState> {
    const root = createRootContext()
    for (const service of CORE_SERVICES) await root.use(service as never, {} as never)
    return { root, mode: isPreviewInstance() ? "preview-instance" : "full", fibers: new Map(), locks: new Map(), seq: 0, started: false }
}

export function getPluginKernel(): Promise<KernelState> {
    const g = globalThis as GlobalWithKernel
    g[KEY] ??= createKernel().catch((error: unknown) => {
        delete g[KEY]
        throw error
    })
    return g[KEY]
}

/** Só para testes: descarta o kernel e os registros. */
export async function resetPluginKernelForTests(): Promise<void> {
    const g = globalThis as GlobalWithKernel
    const current = g[KEY]
    delete g[KEY]
    if (current) {
        const state = await current.catch(() => null)
        for (const loaded of state?.fibers.values() ?? []) await loaded.fiber.dispose().catch(() => undefined)
    }
    pluginRegistries().tools.clear()
    pluginRegistries().routes.clear()
    pluginRegistries().crons.clear()
}

/** Serializa as operações de um plugin (duas recargas simultâneas não se cruzam). */
async function withPluginLock<T>(state: KernelState, pluginId: string, task: () => Promise<T>): Promise<T> {
    const previous = state.locks.get(pluginId) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(task)
    state.locks.set(pluginId, run)
    try {
        return await run
    } finally {
        if (state.locks.get(pluginId) === run) state.locks.delete(pluginId)
    }
}

const ARTIFACT_DIR = () => path.join(os.tmpdir(), "opex-plugins")

/** Grava o artefato do servidor (nome imutável pelo conteúdo) e o importa fora do bundler do Next. */
async function importArtifact(pluginId: string, channel: PluginChannel, artifact: { code: string; hash: string }): Promise<unknown> {
    const dir = ARTIFACT_DIR()
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, `${pluginId}-${artifact.hash}.mjs`)
    try {
        await access(file)
    } catch {
        await writeFile(file, artifact.code, "utf8")
    }
    // Canal na URL: a stable e a prévia da mesma versão não compartilham estado de módulo.
    const url = `${pathToFileURL(file).href}?channel=${channel}`
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)) as { default?: unknown }
    return mod.default
}

/** Normaliza o export padrão do plugin (`definePlugin({ inject, apply })` ou uma função `apply`). */
export function toPluginComponent(value: unknown, manifest: PluginManifest): PluginComponent {
    const component: PluginComponent | null =
        typeof value === "function"
            ? { apply: value as PluginComponent["apply"] }
            : value && typeof value === "object" && typeof (value as PluginComponent).apply === "function"
              ? (value as PluginComponent)
              : null
    if (!component) throw new Error("O servidor do plugin deve exportar por padrão definePlugin({ apply }) ou uma função apply(ctx)")
    const inject = Array.isArray(component.inject) ? component.inject : component.inject ? Object.keys(component.inject) : []
    const unknown = inject.filter((name) => !(PLUGIN_SERVICES as readonly string[]).includes(name))
    if (unknown.length) throw new Error(`Serviços desconhecidos em inject: ${unknown.join(", ")}`)
    const undeclared = inject.filter((name) => !(manifest.services as readonly string[]).includes(name))
    if (undeclared.length) throw new Error(`Serviços usados sem declarar em plugin.json (services): ${undeclared.join(", ")}`)
    return { ...component, inject }
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms)
        Promise.resolve(promise).then(
            (value) => {
                clearTimeout(timer)
                resolve(value)
            },
            (error: unknown) => {
                clearTimeout(timer)
                reject(error)
            },
        )
    })
}

export interface ActivationTarget {
    pluginId: string
    channel: PluginChannel
    versionId: string
    manifest: PluginManifest
    artifact: { code: string; hash: string } | null
}

export type ActivationResult = { ok: true; skipped?: "preview-instance" | "unchanged" | "no-server"; warning?: string | null } | { ok: false; error: string }

/**
 * Ativa (ou troca) a versão de um canal. Transacional: falha ao importar ou ativar mantém a fiber
 * anterior e devolve o erro em pt-BR.
 */
export async function activatePluginServer(target: ActivationTarget): Promise<ActivationResult> {
    const state = await getPluginKernel()
    if (state.mode === "preview-instance") return { ok: true, skipped: "preview-instance" }
    return withPluginLock(state, target.pluginId, async () => {
        const key = fiberKey(target.pluginId, target.channel)
        const current = state.fibers.get(key)
        if (!target.artifact) {
            if (current) await disposeLoaded(state, key)
            return { ok: true, skipped: "no-server" }
        }
        if (current && current.versionId === target.versionId && current.hash === target.artifact.hash) return { ok: true, skipped: "unchanged" }

        const compat = checkPluginApiVersion(target.manifest.apiVersion, PLUGIN_API_VERSION)
        if (!compat.ok) return { ok: false, error: compat.message }

        const fiberId = `${target.pluginId}:${target.channel}:${++state.seq}`
        let fiber: Fiber | null = null
        try {
            const exported = await withTimeout(importArtifact(target.pluginId, target.channel, target.artifact), PLUGIN_ACTIVATION_TIMEOUT_MS, "Tempo esgotado ao importar o plugin")
            const component = toPluginComponent(exported, target.manifest)
            const meta = { pluginId: target.pluginId, channel: target.channel, versionId: target.versionId, fiberId, manifest: target.manifest }
            const wrapper: PluginComponent = {
                name: `plugin:${target.pluginId}:${target.channel}`,
                inject: component.inject,
                apply: async (ctx, config) => {
                    markPluginFiber(ctx.fiber, meta)
                    await component.apply(ctx, config)
                },
            }
            const started = state.root.use(wrapper as never, {} as never)
            fiber = started
            await withTimeout(started, PLUGIN_ACTIVATION_TIMEOUT_MS, "Tempo esgotado ao ativar o plugin")
        } catch (error) {
            if (fiber) await fiber.dispose().catch(() => undefined)
            const message = error instanceof Error ? error.message : String(error)
            log().warn({ err: error, pluginId: target.pluginId, channel: target.channel, versionId: target.versionId }, "[plugins] Falha ao ativar a versão; a anterior continua")
            return { ok: false, error: `Falha ao ativar o plugin: ${message}` }
        }

        state.fibers.set(key, { pluginId: target.pluginId, channel: target.channel, versionId: target.versionId, hash: target.artifact.hash, fiber, fiberId, activatedAt: new Date(), warning: compat.warning })
        if (current) await current.fiber.dispose().catch((error: unknown) => log().warn({ err: error, pluginId: target.pluginId }, "[plugins] Falha ao descartar a fiber anterior"))
        log().info({ pluginId: target.pluginId, channel: target.channel, versionId: target.versionId }, "[plugins] Versão ativada")
        return { ok: true, warning: compat.warning }
    })
}

async function disposeLoaded(state: KernelState, key: string): Promise<void> {
    const loaded = state.fibers.get(key)
    if (!loaded) return
    state.fibers.delete(key)
    await loaded.fiber.dispose().catch((error: unknown) => log().warn({ err: error, key }, "[plugins] Falha ao descartar a fiber"))
}

/** Desliga o código de servidor de um canal (ou dos dois). */
export async function deactivatePluginServer(pluginId: string, channel?: PluginChannel): Promise<void> {
    const state = await getPluginKernel()
    await withPluginLock(state, pluginId, async () => {
        for (const ch of channel ? [channel] : (["stable", "preview"] as const)) await disposeLoaded(state, fiberKey(pluginId, ch))
    })
}

export async function loadedPluginFiber(pluginId: string, channel: PluginChannel): Promise<LoadedFiber | null> {
    const state = await getPluginKernel()
    return state.fibers.get(fiberKey(pluginId, channel)) ?? null
}

export async function kernelMode(): Promise<KernelMode> {
    return (await getPluginKernel()).mode
}

export interface PluginRuntimeSnapshot {
    mode: KernelMode
    apiVersion: string
    services: string[]
    fibers: Array<{ pluginId: string; channel: PluginChannel; versionId: string; activatedAt: string; warning: string | null; effects: string[] }>
    tools: Array<{ name: string; pluginId: string; channel: PluginChannel }>
    routes: Array<{ method: string; path: string; pluginId: string; channel: PluginChannel }>
    crons: Array<{ name: string; pluginId: string; channel: PluginChannel; scheduled: boolean }>
}

/** Fotografia do runtime: fibers, efeitos e registros (ferramenta `inspect_plugin_runtime`). */
export async function inspectPluginRuntime(): Promise<PluginRuntimeSnapshot> {
    const state = await getPluginKernel()
    const registries = pluginRegistries()
    return {
        mode: state.mode,
        apiVersion: PLUGIN_API_VERSION,
        services: [...PLUGIN_SERVICES],
        fibers: [...state.fibers.values()].map((loaded) => ({
            pluginId: loaded.pluginId,
            channel: loaded.channel,
            versionId: loaded.versionId,
            activatedAt: loaded.activatedAt.toISOString(),
            warning: loaded.warning,
            effects: effectLabels(loaded.fiber),
        })),
        tools: registries.tools.list().map((item) => ({ name: item.value.name, pluginId: item.owner.pluginId, channel: item.owner.channel })),
        routes: registries.routes.list().map((item) => ({ method: item.value.method, path: item.value.path, pluginId: item.owner.pluginId, channel: item.owner.channel })),
        crons: registries.crons.list().map((item) => ({ name: item.value.name, pluginId: item.owner.pluginId, channel: item.owner.channel, scheduled: item.value.scheduled })),
    }
}

/** Marca o kernel como iniciado (idempotente). Devolve `false` se já estava. */
export async function markKernelStarted(): Promise<boolean> {
    const state = await getPluginKernel()
    if (state.started) return false
    state.started = true
    return true
}
