import type { PluginInfo } from "@opencode/client"
import { disabledFor, findDisabled, manifestPath, withDisabled, withoutDisabled } from "../disabled-manifest"
import { ConfigFormatError, listPluginEntries, pluginSpecOf, setPluginEntries, type PluginEntry } from "../jsonc-edit"
import type { OpencodeResourceDetailDto, OpencodeResourceDto } from "../types"
import { isNewer, parseNpmSpec } from "../versions"
import { configError, writeConfig, type ScopeContext } from "./context"
import { alreadyExists, baseDto, notFound, readOnly, type KindHandler } from "./handler"
import { toDomainError } from "@/features/opencode-accounts/server/service"
import { npmAvailable } from "./versions"

/**
 * Plugins: a lista `plugins` (ou `plugin`, formato 1.x) do JSON da configuração do escopo. Instalar e
 * desinstalar editam a lista (o OpenCode baixa o pacote ao carregar); atualizar usa `plugin.update`.
 * Tudo só vale depois de reiniciar o serviço. Os plugins internos do OpenCode ficam de fora.
 */

const RESTART = { restartRequired: true }

async function runtimePlugins(ctx: ScopeContext, refresh?: boolean): Promise<PluginInfo[]> {
    const call = refresh ? ctx.host.client.plugin.check({ location: ctx.location }) : ctx.host.client.plugin.list({ location: ctx.location })
    return call.then((result) => result.data).catch(() => [])
}

async function versionFor(spec: string, info: PluginInfo | undefined, refresh?: boolean): Promise<OpencodeResourceDto["version"]> {
    const installed = info?.source.type === "package" ? (info.source.version ?? null) : null
    const npm = parseNpmSpec(spec)
    const available = npm ? await npmAvailable(npm.name, npm.range, refresh) : null
    const flagged = info?.source.type === "package" && info.source.outdated === true
    return { installed, available, outdated: flagged || isNewer(available, installed) }
}

function tagsOf(info: PluginInfo | undefined): string[] {
    if (!info) return ["não carregado (reinicie o serviço)"]
    const tags = Object.keys(info.features ?? {})
    if (info.state.status === "failed") tags.push(`falhou: ${info.state.error.slice(0, 120)}`)
    return tags
}

async function configEntries(ctx: ScopeContext): Promise<PluginEntry[]> {
    return listPluginEntries(await ctx.readConfig())
}

async function list(ctx: ScopeContext, options: { refresh?: boolean }): Promise<OpencodeResourceDto[]> {
    const [entries, runtime, manifest] = await Promise.all([configEntries(ctx), runtimePlugins(ctx, options.refresh), ctx.manifest()])
    const byTarget = new Map(runtime.filter((info) => info.source.type === "package").map((info) => [(info.source as { target: string }).target, info]))
    const configured = await Promise.all(
        entries.map(async (entry) => {
            const spec = pluginSpecOf(entry)
            const info = byTarget.get(spec)
            return baseDto(ctx, "plugin", spec, { description: info?.id ?? null, origin: "package", source: spec, path: null, enabled: true, builtin: false, editable: false, removable: true, version: await versionFor(spec, info, options.refresh), tags: tagsOf(info) })
        }),
    )
    const local = ctx.scope.directory
        ? []
        : runtime
              .filter((info) => info.source.type === "local")
              .map((info) => baseDto(ctx, "plugin", info.id ?? (info.source as { path: string }).path, { description: (info.source as { path: string }).path, origin: "local", source: null, path: (info.source as { path: string }).path, enabled: true, builtin: true, editable: false, removable: false, version: null, tags: ["arquivo local", ...tagsOf(info)] }))
    const disabled = disabledFor(manifest, "plugin", ctx.scope.id).map((entry) => baseDto(ctx, "plugin", entry.name, { description: null, origin: "package", source: entry.name, path: null, enabled: false, builtin: false, editable: false, removable: true, version: null, tags: [] }))
    return [...configured, ...disabled, ...local]
}

async function saveEntries(ctx: ScopeContext, entries: readonly PluginEntry[]) {
    const file = await ctx.configFile()
    try {
        await writeConfig(ctx, setPluginEntries(file.text, entries))
    } catch (error) {
        if (error instanceof ConfigFormatError) configError(error)
        throw error
    }
}

async function get(ctx: ScopeContext, name: string): Promise<OpencodeResourceDetailDto> {
    const item = (await list(ctx, {})).find((entry) => entry.name === name)
    if (!item) throw notFound("plugin", name)
    const entry = (await configEntries(ctx)).find((value) => pluginSpecOf(value) === name)
    return { ...item, format: "plugin", frontmatter: null, body: null, config: entry && typeof entry === "object" ? (entry as unknown as Record<string, unknown>) : { package: name }, mcp: null, files: [] }
}

const manifestFile = (ctx: ScopeContext) => manifestPath(ctx.host.home)

async function remove(ctx: ScopeContext, name: string) {
    const entries = await configEntries(ctx)
    const file = await ctx.configFile()
    if (entries.some((entry) => pluginSpecOf(entry) === name)) {
        await ctx.backup("desinstalar", `Desinstalar o plugin ${name}`, [file.path])
        await saveEntries(ctx, entries.filter((entry) => pluginSpecOf(entry) !== name))
        return RESTART
    }
    const manifest = await ctx.manifest()
    if (findDisabled(manifest, "plugin", ctx.scope.id, name)) {
        await ctx.backup("desinstalar", `Desinstalar o plugin desligado ${name}`, [manifestFile(ctx)])
        await ctx.saveManifest(withoutDisabled(manifest, "plugin", ctx.scope.id, name))
        return {}
    }
    if ((await list(ctx, {})).some((item) => item.name === name)) throw readOnly(name)
    throw notFound("plugin", name)
}

async function setEnabled(ctx: ScopeContext, name: string, enabled: boolean) {
    const [entries, manifest, file] = await Promise.all([configEntries(ctx), ctx.manifest(), ctx.configFile()])
    const current = entries.find((entry) => pluginSpecOf(entry) === name)
    const stored = findDisabled(manifest, "plugin", ctx.scope.id, name)
    if (enabled) {
        if (!stored) {
            if (current) return {}
            throw notFound("plugin", name)
        }
        await ctx.backup("ligar", `Ligar o plugin ${name}`, [file.path, manifestFile(ctx)])
        await saveEntries(ctx, [...entries, (stored.configEntry as PluginEntry | undefined) ?? name])
        await ctx.saveManifest(withoutDisabled(manifest, "plugin", ctx.scope.id, name))
        return RESTART
    }
    if (!current) {
        if (stored) return {}
        throw notFound("plugin", name)
    }
    await ctx.backup("desligar", `Desligar o plugin ${name}`, [file.path, manifestFile(ctx)])
    await ctx.saveManifest(withDisabled(manifest, { kind: "plugin", scope: ctx.scope.id, name, originalPath: null, storedPath: null, configPath: file.path, configEntry: current, disabledAt: new Date().toISOString() }))
    await saveEntries(ctx, entries.filter((entry) => pluginSpecOf(entry) !== name))
    return RESTART
}

async function install(ctx: ScopeContext, input: { source: string }) {
    const entries = await configEntries(ctx)
    const manifest = await ctx.manifest()
    if (entries.some((entry) => pluginSpecOf(entry) === input.source) || findDisabled(manifest, "plugin", ctx.scope.id, input.source)) throw alreadyExists(input.source)
    const file = await ctx.configFile()
    await ctx.backup("instalar", `Instalar o plugin ${input.source}`, [file.path])
    await saveEntries(ctx, [...entries, input.source])
    return { ...RESTART, names: [input.source] }
}

async function updateVersions(ctx: ScopeContext, items: readonly OpencodeResourceDto[]) {
    const targets = items.filter((item) => item.enabled && item.origin === "package").map((item) => item.name)
    if (targets.length === 0) return {}
    const file = await ctx.configFile()
    await ctx.backup("atualizar", `Atualizar plugins: ${targets.join(", ")}`, [file.path])
    try {
        await ctx.host.client.plugin.update({ targets, location: ctx.location })
    } catch (error) {
        throw toDomainError(error)
    }
    return RESTART
}

export const pluginHandler: KindHandler = { list, get, remove, setEnabled, install, updateVersions }
