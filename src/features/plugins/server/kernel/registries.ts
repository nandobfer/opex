import type { OpexTool } from "@/features/opex-agent/server/tools/define"
import type { Schedule } from "@/lib/integrations/schedule"
import type { PluginChannel, PluginRouteMethod } from "../../constants"

/**
 * Registros do runtime de plugins (OPE-172), guardados em `globalThis`: o `instrumentation.ts` e as
 * rotas do Next podem avaliar os módulos em grafos diferentes (como o cache do Mongoose), e todos
 * precisam ver as mesmas ferramentas, rotas e crons.
 *
 * Cada chave guarda uma PILHA de donos (fibers): na recarga a versão nova empilha por cima e o
 * `dispose` da antiga só remove a própria entrada — sem janela em que a ferramenta some e sem resíduo.
 * Módulo leve (sem Cordis): importado pelo catálogo do Agente Opex.
 */

export interface PluginOwner {
    pluginId: string
    channel: PluginChannel
    versionId: string
    /** Token único da fiber (duas ativações da mesma versão são donas diferentes). */
    fiberId: string
}

export interface StackEntry<T> {
    owner: PluginOwner
    value: T
}

export class StackRegistry<T> {
    private readonly entries = new Map<string, StackEntry<T>[]>()

    add(key: string, owner: PluginOwner, value: T): () => void {
        const stack = this.entries.get(key) ?? []
        const entry: StackEntry<T> = { owner, value }
        stack.push(entry)
        this.entries.set(key, stack)
        return () => {
            const current = this.entries.get(key)
            if (!current) return
            const next = current.filter((item) => item !== entry)
            if (next.length) this.entries.set(key, next)
            else this.entries.delete(key)
        }
    }

    /** Entrada do topo (a mais recente). */
    get(key: string): StackEntry<T> | undefined {
        const stack = this.entries.get(key)
        return stack?.[stack.length - 1]
    }

    /** Topo de cada chave. */
    list(): Array<{ key: string } & StackEntry<T>> {
        return [...this.entries.entries()].map(([key, stack]) => ({ key, ...stack[stack.length - 1]! }))
    }

    /** Todas as entradas (inclusive as que estão por baixo na pilha). */
    all(): Array<{ key: string } & StackEntry<T>> {
        return [...this.entries.entries()].flatMap(([key, stack]) => stack.map((entry) => ({ key, ...entry })))
    }

    clear(): void {
        this.entries.clear()
    }
}

export interface PluginRouteRequest {
    req: Request
    /** Parâmetros `:nome` da rota declarada. */
    params: Record<string, string>
    /** Caminho depois de `/api/p/{pluginId}`. */
    path: string
}

export type PluginRouteHandler = (request: PluginRouteRequest) => Promise<Response | unknown> | Response | unknown

export interface PluginRouteEntry {
    method: PluginRouteMethod
    /** Caminho declarado (`/itens/:id`). */
    path: string
    handler: PluginRouteHandler
}

export interface PluginCronEntry {
    name: string
    schedule: Schedule
    run: () => Promise<unknown> | unknown
    /** `false` na fiber de prévia: os crons da prévia não rodam (só a stable agenda). */
    scheduled: boolean
}

export interface PluginRegistries {
    /** Chave: `{channel}|{nome da ferramenta}`. */
    tools: StackRegistry<OpexTool>
    /** Chave: `{channel}|{pluginId}|{método}|{caminho}`. */
    routes: StackRegistry<PluginRouteEntry>
    /** Chave: `{channel}|{pluginId}|{nome}`. */
    crons: StackRegistry<PluginCronEntry>
}

const KEY = "__opexPluginRegistries"
type GlobalWithRegistries = typeof globalThis & { [KEY]?: PluginRegistries }

export function pluginRegistries(): PluginRegistries {
    const g = globalThis as GlobalWithRegistries
    g[KEY] ??= { tools: new StackRegistry(), routes: new StackRegistry(), crons: new StackRegistry() }
    return g[KEY]
}

export const toolKey = (channel: PluginChannel, name: string) => `${channel}|${name}`
export const routeKey = (channel: PluginChannel, pluginId: string, method: string, path: string) => `${channel}|${pluginId}|${method}|${path}`
export const cronKey = (channel: PluginChannel, pluginId: string, name: string) => `${channel}|${pluginId}|${name}`

/**
 * Ferramentas de plugin visíveis para um turno: a da `stable`, trocada pela da `preview` quando a
 * prévia daquele plugin está ligada no turno (cookie do navegador que disparou o turno).
 */
export function pluginToolList(previewPlugins: ReadonlySet<string> = new Set()): OpexTool[] {
    const registries = pluginRegistries()
    const byName = new Map<string, OpexTool>()
    for (const entry of registries.tools.list()) {
        const [channel, name] = entry.key.split("|") as [PluginChannel, string]
        if (channel === "stable" && !byName.has(name)) byName.set(name, entry.value)
    }
    for (const entry of registries.tools.list()) {
        const [channel, name] = entry.key.split("|") as [PluginChannel, string]
        if (channel === "preview" && previewPlugins.has(entry.owner.pluginId)) byName.set(name, entry.value)
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Casa um caminho com o padrão declarado (`/itens/:id`); devolve os parâmetros ou `null`. */
export function matchRoutePath(pattern: string, path: string): Record<string, string> | null {
    const split = (value: string) => value.split("/").filter(Boolean)
    const patternParts = split(pattern)
    const pathParts = split(path)
    if (patternParts.length !== pathParts.length) return null
    const params: Record<string, string> = {}
    for (let i = 0; i < patternParts.length; i++) {
        const expected = patternParts[i]!
        const actual = pathParts[i]!
        if (expected.startsWith(":")) params[expected.slice(1)] = decodeURIComponent(actual)
        else if (expected !== actual) return null
    }
    return params
}

/** Rota registrada no canal (`preview` quando a prévia do plugin está ligada e a fiber de prévia existe). */
export function findPluginRoute(pluginId: string, method: string, path: string, channel: PluginChannel): { entry: PluginRouteEntry; params: Record<string, string> } | null {
    const prefix = `${channel}|${pluginId}|${method.toUpperCase()}|`
    for (const candidate of pluginRegistries().routes.list()) {
        if (!candidate.key.startsWith(prefix)) continue
        const params = matchRoutePath(candidate.value.path, path)
        if (params) return { entry: candidate.value, params }
    }
    return null
}
