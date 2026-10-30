import type { ZodType } from "zod"
import { listMarkdownFilesCommand, moveCommand, removeCommand } from "../commands"
import { disabledFor, findDisabled, manifestPath, storedPathFor, withDisabled, withoutDisabled } from "../disabled-manifest"
import { FrontmatterError, parseMarkdownDocument, serializeMarkdownDocument, type MarkdownDocument } from "../frontmatter"
import { ConfigFormatError, listSectionEntries, setSectionEntry, type ConfigSection } from "../jsonc-edit"
import { baseName, isInside, stripMd } from "../paths"
import { agentConfigSchema, agentFrontmatterSchema, commandConfigSchema, commandFrontmatterSchema, type ResourceContentInput } from "../schemas"
import type { OpencodeResourceDetailDto, OpencodeResourceDto } from "../types"
import { configError, writeConfig, type ScopeContext } from "./context"
import { alreadyExists, baseDto, invalid, mustBeEnabled, notFound, readOnly, zodMessage, type KindHandler } from "./handler"
import { runOrFail } from "./host"

/**
 * Agentes e comandos: arquivos `.md` com frontmatter (`agents/`, `commands/` da configuração do escopo)
 * ou entradas do JSON (`agents.<nome>`, `commands.<nome>`). Os nativos do OpenCode e os de plugins
 * aparecem só para leitura (escopo global). Criados à mão sempre em arquivo.
 */

type MarkdownKind = "agent" | "command"

interface KindSpec {
    kind: MarkdownKind
    label: string
    section: ConfigSection
    dirs: (ctx: ScopeContext) => string[]
    newDir: (ctx: ScopeContext) => string
    frontmatterSchema: ZodType<Record<string, unknown>>
    configSchema: ZodType<Record<string, unknown>>
    bodyRequired: boolean
    runtime: (ctx: ScopeContext) => Promise<{ name: string; description: string | null; tags: string[] }[]>
    tagsOf: (data: Record<string, unknown>) => string[]
}

interface FileItem {
    name: string
    path: string
}

async function scanFiles(ctx: ScopeContext, spec: KindSpec): Promise<FileItem[]> {
    const output = await runOrFail(ctx.host, listMarkdownFilesCommand(spec.dirs(ctx)), `Não foi possível listar os ${spec.label}s no host`, 20_000, { quiet: true })
    const seen = new Set<string>()
    return output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((path) => ({ name: stripMd(baseName(path)), path }))
        .filter((item) => (seen.has(item.name) ? false : (seen.add(item.name), true)))
}

function safeParse(text: string): { doc: MarkdownDocument; error: string | null } {
    try {
        return { doc: parseMarkdownDocument(text), error: null }
    } catch (error) {
        if (error instanceof FrontmatterError) return { doc: { frontmatter: {}, body: text }, error: error.message }
        throw error
    }
}

const textOf = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)

async function readConfigSafe(ctx: ScopeContext): Promise<Record<string, unknown> | null> {
    try {
        return await ctx.readConfig()
    } catch {
        return null
    }
}

function makeHandler(spec: KindSpec): KindHandler {
    const manifestFile = (ctx: ScopeContext) => manifestPath(ctx.host.home)

    async function list(ctx: ScopeContext): Promise<OpencodeResourceDto[]> {
        const [files, config, manifest, runtime] = await Promise.all([scanFiles(ctx, spec), readConfigSafe(ctx), ctx.manifest(), ctx.scope.directory ? Promise.resolve([]) : spec.runtime(ctx).catch(() => [])])
        const fileItems = await Promise.all(
            files.map(async (file) => {
                const { doc, error } = safeParse((await ctx.host.readText(file.path)) ?? "")
                return baseDto(ctx, spec.kind, file.name, {
                    description: textOf(doc.frontmatter.description),
                    origin: "file",
                    source: null,
                    path: file.path,
                    enabled: true,
                    builtin: false,
                    editable: true,
                    removable: true,
                    version: null,
                    tags: [...spec.tagsOf(doc.frontmatter), ...(error ? ["frontmatter inválido"] : [])],
                })
            }),
        )
        const sectionEntries: Record<string, Record<string, unknown>> = config ? listSectionEntries(config, spec.section) : {}
        const configured = Object.entries(sectionEntries)
            .filter(([name]) => !files.some((file) => file.name === name))
            .map(([name, value]) =>
                baseDto(ctx, spec.kind, name, { description: textOf(value.description), origin: "config", source: null, path: null, enabled: true, builtin: false, editable: true, removable: true, version: null, tags: ["no JSON da configuração", ...spec.tagsOf(value)] }),
            )
        const disabled = disabledFor(manifest, spec.kind, ctx.scope.id).map((entry) =>
            baseDto(ctx, spec.kind, entry.name, { description: null, origin: entry.storedPath ? "file" : "config", source: null, path: entry.storedPath, enabled: false, builtin: false, editable: false, removable: true, version: null, tags: [] }),
        )
        const known = new Set([...fileItems, ...configured, ...disabled].map((item) => item.name))
        const builtins = runtime
            .filter((item) => !known.has(item.name))
            .map((item) => baseDto(ctx, spec.kind, item.name, { description: item.description, origin: "builtin", source: null, path: null, enabled: true, builtin: true, editable: false, removable: false, version: null, tags: ["nativo ou de plugin", ...item.tags] }))
        return [...fileItems, ...configured, ...disabled, ...builtins]
    }

    async function locate(ctx: ScopeContext, name: string) {
        const file = (await scanFiles(ctx, spec)).find((item) => item.name === name)
        if (file) return { type: "file" as const, file }
        const config = await ctx.readConfig()
        const entry = listSectionEntries(config, spec.section)[name]
        if (entry) return { type: "config" as const, entry }
        const stored = findDisabled(await ctx.manifest(), spec.kind, ctx.scope.id, name)
        if (stored) return { type: "disabled" as const, stored }
        if (!ctx.scope.directory && (await spec.runtime(ctx).catch(() => [])).some((item) => item.name === name)) return { type: "builtin" as const }
        throw notFound(spec.kind, name)
    }

    function buildFile(content: ResourceContentInput): string {
        const parsed = spec.frontmatterSchema.safeParse(content.frontmatter ?? {})
        if (!parsed.success) throw invalid(zodMessage(parsed.error.issues, "Frontmatter inválido"), parsed.error.issues)
        if (spec.bodyRequired && !content.body?.trim()) throw invalid(`Informe o template do ${spec.label} (corpo do arquivo)`)
        return serializeMarkdownDocument({ frontmatter: { ...(content.frontmatter ?? {}), ...parsed.data }, body: content.body ?? "" })
    }

    function buildConfig(content: ResourceContentInput): Record<string, unknown> {
        const parsed = spec.configSchema.safeParse(content.config ?? {})
        if (!parsed.success) throw invalid(zodMessage(parsed.error.issues, "JSON inválido"), parsed.error.issues)
        return { ...(content.config ?? {}), ...parsed.data }
    }

    async function editConfig(ctx: ScopeContext, name: string, value: Record<string, unknown> | undefined) {
        const file = await ctx.configFile()
        try {
            await writeConfig(ctx, setSectionEntry(file.text, spec.section, name, value))
        } catch (error) {
            if (error instanceof ConfigFormatError) configError(error)
            throw error
        }
    }

    return {
        list,
        async get(ctx, name): Promise<OpencodeResourceDetailDto> {
            const item = (await list(ctx)).find((entry) => entry.name === name)
            if (!item) throw notFound(spec.kind, name)
            if (item.origin === "config" && item.enabled) {
                const config = await ctx.readConfig()
                return { ...item, format: "json", frontmatter: null, body: null, config: listSectionEntries(config, spec.section)[name] ?? {}, mcp: null, files: [] }
            }
            if (!item.path) return { ...item, format: item.builtin ? "markdown" : "json", frontmatter: null, body: null, config: null, mcp: null, files: [] }
            const { doc } = safeParse((await ctx.host.readText(item.path)) ?? "")
            return { ...item, format: "markdown", frontmatter: doc.frontmatter, body: doc.body, config: null, mcp: null, files: [] }
        },
        async create(ctx, name, content) {
            const [files, config, manifest] = await Promise.all([scanFiles(ctx, spec), ctx.readConfig(), ctx.manifest()])
            if (files.some((file) => file.name === name) || listSectionEntries(config, spec.section)[name] || findDisabled(manifest, spec.kind, ctx.scope.id, name)) throw alreadyExists(name)
            const text = buildFile(content)
            const path = `${spec.newDir(ctx)}/${name}.md`
            await ctx.backup("criar", `Criar o ${spec.label} ${name}`, [path])
            await ctx.host.writeText(path, text)
            return {}
        },
        async update(ctx, name, content) {
            const found = await locate(ctx, name)
            if (found.type === "builtin") throw readOnly(name)
            if (found.type === "disabled") throw mustBeEnabled(name)
            if (found.type === "file") {
                const text = buildFile(content)
                await ctx.backup("editar", `Editar o ${spec.label} ${name}`, [found.file.path])
                await ctx.host.writeText(found.file.path, text)
                return {}
            }
            const value = buildConfig(content)
            const file = await ctx.configFile()
            await ctx.backup("editar", `Editar o ${spec.label} ${name}`, [file.path])
            await editConfig(ctx, name, value)
            return {}
        },
        async remove(ctx, name) {
            const found = await locate(ctx, name)
            if (found.type === "builtin") throw readOnly(name)
            if (found.type === "file") {
                if (!isInside(found.file.path, spec.dirs(ctx))) throw readOnly(name)
                await ctx.backup("excluir", `Excluir o ${spec.label} ${name}`, [found.file.path])
                await runOrFail(ctx.host, removeCommand(found.file.path), `Não foi possível apagar o ${spec.label}`)
            } else if (found.type === "config") {
                const file = await ctx.configFile()
                await ctx.backup("excluir", `Excluir o ${spec.label} ${name}`, [file.path])
                await editConfig(ctx, name, undefined)
            } else {
                await ctx.backup("excluir", `Excluir o ${spec.label} desligado ${name}`, [found.stored.storedPath ?? "", manifestFile(ctx)])
                if (found.stored.storedPath) await runOrFail(ctx.host, removeCommand(found.stored.storedPath), `Não foi possível apagar o ${spec.label}`)
                await ctx.saveManifest(withoutDisabled(await ctx.manifest(), spec.kind, ctx.scope.id, name))
            }
            return {}
        },
        async setEnabled(ctx, name, enabled) {
            const found = await locate(ctx, name)
            if (found.type === "builtin") throw readOnly(name)
            const manifest = await ctx.manifest()
            if (enabled) {
                if (found.type !== "disabled") return {}
                const entry = found.stored
                if (entry.storedPath && entry.originalPath) {
                    await ctx.backup("ligar", `Ligar o ${spec.label} ${name}`, [entry.storedPath, entry.originalPath, manifestFile(ctx)])
                    await runOrFail(ctx.host, moveCommand(entry.storedPath, entry.originalPath), `Não foi possível ligar o ${spec.label}`)
                } else {
                    const file = await ctx.configFile()
                    await ctx.backup("ligar", `Ligar o ${spec.label} ${name}`, [file.path, manifestFile(ctx)])
                    await editConfig(ctx, name, (entry.configEntry ?? {}) as Record<string, unknown>)
                }
                await ctx.saveManifest(withoutDisabled(manifest, spec.kind, ctx.scope.id, name))
                return {}
            }
            if (found.type === "disabled") return {}
            const disabledAt = new Date().toISOString()
            if (found.type === "file") {
                const stored = storedPathFor(ctx.host.home, ctx.scope.id, spec.kind, found.file.path)
                await ctx.backup("desligar", `Desligar o ${spec.label} ${name}`, [found.file.path, stored, manifestFile(ctx)])
                await runOrFail(ctx.host, moveCommand(found.file.path, stored), `Não foi possível desligar o ${spec.label}`)
                await ctx.saveManifest(withDisabled(manifest, { kind: spec.kind, scope: ctx.scope.id, name, originalPath: found.file.path, storedPath: stored, configPath: null, disabledAt }))
                return {}
            }
            const file = await ctx.configFile()
            await ctx.backup("desligar", `Desligar o ${spec.label} ${name}`, [file.path, manifestFile(ctx)])
            await ctx.saveManifest(withDisabled(manifest, { kind: spec.kind, scope: ctx.scope.id, name, originalPath: null, storedPath: null, configPath: file.path, configEntry: found.entry, disabledAt }))
            await editConfig(ctx, name, undefined)
            return {}
        },
    }
}

const modeTag = (data: Record<string, unknown>) => (typeof data.mode === "string" ? [data.mode] : [])

export const agentHandler = makeHandler({
    kind: "agent",
    label: "agente",
    section: "agents",
    dirs: (ctx) => ctx.paths.agentDirs,
    newDir: (ctx) => ctx.paths.newAgentDir,
    frontmatterSchema: agentFrontmatterSchema,
    configSchema: agentConfigSchema,
    bodyRequired: false,
    runtime: async (ctx) =>
        (await ctx.host.client.agent.list({ location: ctx.location })).data.map((agent) => ({ name: agent.id, description: agent.description ?? null, tags: [agent.mode, ...(agent.hidden ? ["oculto"] : [])] })),
    tagsOf: modeTag,
})

export const commandHandler = makeHandler({
    kind: "command",
    label: "comando",
    section: "commands",
    dirs: (ctx) => ctx.paths.commandDirs,
    newDir: (ctx) => ctx.paths.newCommandDir,
    frontmatterSchema: commandFrontmatterSchema,
    configSchema: commandConfigSchema,
    bodyRequired: true,
    runtime: async (ctx) => (await ctx.host.client.command.list({ location: ctx.location })).data.map((command) => ({ name: command.name, description: command.description ?? null, tags: [] })),
    tagsOf: (data) => (typeof data.agent === "string" ? [`agente ${data.agent}`] : []),
})
