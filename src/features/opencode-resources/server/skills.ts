import { INSTALL_TIMEOUT_MS } from "../constants"
import { disabledFor, findDisabled, manifestPath, storedPathFor, withDisabled, withoutDisabled } from "../disabled-manifest"
import { FrontmatterError, parseMarkdownDocument, serializeMarkdownDocument } from "../frontmatter"
import { listSkillDirsCommand, listSkillFilesCommand, moveCommand, removeCommand, skillsAddCommand, skillsUpdateCommand } from "../commands"
import { baseName, dirName, isInside, parseSkillLock, skillRepoFolder, type SkillLockEntry } from "../paths"
import { skillFrontmatterSchema, type ResourceContentInput } from "../schemas"
import type { OpencodeResourceDetailDto, OpencodeResourceDto } from "../types"
import type { ScopeContext } from "./context"
import { alreadyExists, baseDto, invalid, mustBeEnabled, notFound, readOnly, zodMessage, type KindHandler } from "./handler"
import { runOrFail } from "./host"
import { githubFolderHash } from "./versions"

/**
 * Skills: pastas com `SKILL.md` (frontmatter `name` + `description`). Criadas à mão em
 * `~/.agents/skills/<nome>` (global) ou `<projeto>/.agents/skills/<nome>`; instaladas/atualizadas de
 * repositório pela CLI `npx skills` (lock com origem e hash da pasta no git).
 */

interface SkillFile {
    name: string
    dir: string
    file: string
}

async function scan(ctx: ScopeContext): Promise<SkillFile[]> {
    const output = await runOrFail(ctx.host, listSkillDirsCommand(ctx.paths.skillRoots), "Não foi possível listar as skills no host", 20_000, { quiet: true })
    const seen = new Set<string>()
    const out: SkillFile[] = []
    for (const line of output.split("\n").map((item) => item.trim()).filter(Boolean)) {
        const dir = dirName(line)
        const name = baseName(dir)
        if (seen.has(name)) continue
        seen.add(name)
        out.push({ name, dir, file: line })
    }
    return out
}

async function readLock(ctx: ScopeContext): Promise<Record<string, SkillLockEntry>> {
    return parseSkillLock(await ctx.host.readText(ctx.paths.skillLockFile))
}

function versionOf(lock: SkillLockEntry | undefined, available: string | null): OpencodeResourceDto["version"] {
    if (!lock?.hash) return null
    return { installed: lock.hash.slice(0, 7), available: available ? available.slice(0, 7) : null, outdated: Boolean(available && available !== lock.hash) }
}

async function availableHash(lock: SkillLockEntry | undefined, refresh?: boolean): Promise<string | null> {
    if (!lock?.hash) return null
    return githubFolderHash(lock.source, skillRepoFolder(lock.skillPath), refresh)
}

async function list(ctx: ScopeContext, options: { refresh?: boolean }): Promise<OpencodeResourceDto[]> {
    const [files, runtime, lock, manifest] = await Promise.all([
        scan(ctx),
        ctx.host.client.skill.list({ location: ctx.location }).then((result) => result.data).catch(() => []),
        readLock(ctx),
        ctx.manifest(),
    ])
    const byPath = new Map(runtime.map((skill) => [skill.path, skill]))
    const items = await Promise.all(
        files.map(async (file) => {
            const loaded = byPath.get(file.file)
            const entry = lock[file.name]
            return baseDto(ctx, "skill", file.name, {
                description: loaded?.description ?? null,
                origin: entry ? "package" : "file",
                source: entry?.source ?? null,
                path: file.dir,
                enabled: true,
                builtin: false,
                editable: true,
                removable: true,
                version: versionOf(entry, await availableHash(entry, options.refresh)),
                tags: loaded ? [] : ["não carregada pelo OpenCode"],
            })
        }),
    )
    const disabled = disabledFor(manifest, "skill", ctx.scope.id).map((entry) =>
        baseDto(ctx, "skill", entry.name, { description: null, origin: lock[entry.name] ? "package" : "file", source: lock[entry.name]?.source ?? null, path: entry.storedPath, enabled: false, builtin: false, editable: false, removable: true, version: versionOf(lock[entry.name], null), tags: [] }),
    )
    const builtins = ctx.scope.directory
        ? []
        : runtime
              .filter((skill) => skill.path.startsWith("/builtin/"))
              .map((skill) => baseDto(ctx, "skill", skill.name, { description: skill.description ?? null, origin: "builtin", source: null, path: null, enabled: true, builtin: true, editable: false, removable: false, version: null, tags: ["nativa"] }))
    return [...items, ...disabled, ...builtins]
}

async function locate(ctx: ScopeContext, name: string): Promise<{ file?: SkillFile; stored?: string; builtin?: boolean }> {
    const file = (await scan(ctx)).find((item) => item.name === name)
    if (file) return { file }
    const stored = findDisabled(await ctx.manifest(), "skill", ctx.scope.id, name)
    if (stored?.storedPath) return { stored: stored.storedPath }
    if (!ctx.scope.directory) {
        const runtime = await ctx.host.client.skill.list({ location: ctx.location }).then((result) => result.data).catch(() => [])
        if (runtime.some((skill) => skill.name === name && skill.path.startsWith("/builtin/"))) return { builtin: true }
    }
    throw notFound("skill", name)
}

function parseSkill(text: string) {
    try {
        return parseMarkdownDocument(text)
    } catch (error) {
        if (error instanceof FrontmatterError) return { frontmatter: {}, body: text }
        throw error
    }
}

async function get(ctx: ScopeContext, name: string): Promise<OpencodeResourceDetailDto> {
    const item = (await list(ctx, {})).find((entry) => entry.name === name)
    if (!item) throw notFound("skill", name)
    if (item.builtin || !item.path) return { ...item, format: "markdown", frontmatter: null, body: null, config: null, mcp: null, files: [] }
    const text = (await ctx.host.readText(`${item.path}/SKILL.md`)) ?? ""
    const doc = parseSkill(text)
    const files = (await ctx.host.run(listSkillFilesCommand(item.path), 15_000, { quiet: true })).output.split("\n").map((line) => line.trim()).filter(Boolean)
    return { ...item, format: "markdown", frontmatter: doc.frontmatter, body: doc.body, config: null, mcp: null, files }
}

/** Valida e monta o `SKILL.md` (o `name` do frontmatter é sempre o nome da pasta). */
export function buildSkillFile(name: string, content: ResourceContentInput): string {
    const frontmatter = { ...(content.frontmatter ?? {}) }
    if (frontmatter.name !== undefined && frontmatter.name !== name) throw invalid(`O name do frontmatter ("${String(frontmatter.name)}") precisa ser igual ao nome da skill ("${name}")`)
    const parsed = skillFrontmatterSchema.safeParse({ ...frontmatter, name })
    if (!parsed.success) throw invalid(zodMessage(parsed.error.issues, "Frontmatter inválido"), parsed.error.issues)
    if (!content.body?.trim()) throw invalid("Informe as instruções da skill (corpo do SKILL.md)")
    return serializeMarkdownDocument({ frontmatter: Object.assign({ name }, frontmatter, parsed.data), body: content.body })
}

async function create(ctx: ScopeContext, name: string, content: ResourceContentInput) {
    const [files, manifest] = await Promise.all([scan(ctx), ctx.manifest()])
    if (files.some((file) => file.name === name) || findDisabled(manifest, "skill", ctx.scope.id, name)) throw alreadyExists(name)
    const text = buildSkillFile(name, content)
    const dir = `${ctx.paths.newSkillRoot}/${name}`
    await ctx.backup("criar", `Criar a skill ${name}`, [dir])
    await ctx.host.writeText(`${dir}/SKILL.md`, text)
    return {}
}

async function update(ctx: ScopeContext, name: string, content: ResourceContentInput) {
    const found = await locate(ctx, name)
    if (found.builtin) throw readOnly(name)
    if (!found.file) throw mustBeEnabled(name)
    const text = buildSkillFile(name, content)
    await ctx.backup("editar", `Editar a skill ${name}`, [found.file.file])
    await ctx.host.writeText(found.file.file, text)
    return {}
}

async function dropFromLock(ctx: ScopeContext, name: string) {
    const text = await ctx.host.readText(ctx.paths.skillLockFile)
    if (!text) return
    try {
        const data = JSON.parse(text) as { skills?: Record<string, unknown> }
        if (!data.skills?.[name]) return
        delete data.skills[name]
        await ctx.host.writeText(ctx.paths.skillLockFile, `${JSON.stringify(data, null, 2)}\n`)
    } catch {
        // Lock ilegível: fica como está (a CLI o reescreve).
    }
}

async function remove(ctx: ScopeContext, name: string) {
    const found = await locate(ctx, name)
    if (found.builtin) throw readOnly(name)
    if (found.stored) {
        await ctx.backup("excluir", `Excluir a skill desligada ${name}`, [found.stored, manifestFile(ctx), ctx.paths.skillLockFile])
        await runOrFail(ctx.host, removeCommand(found.stored), "Não foi possível apagar a skill")
        await ctx.saveManifest(withoutDisabled(await ctx.manifest(), "skill", ctx.scope.id, name))
    } else if (found.file) {
        if (!isInside(found.file.dir, ctx.paths.skillRoots)) throw readOnly(name)
        await ctx.backup("excluir", `Excluir a skill ${name}`, [found.file.dir, ctx.paths.skillLockFile])
        await runOrFail(ctx.host, removeCommand(found.file.dir), "Não foi possível apagar a skill")
    }
    await dropFromLock(ctx, name)
    return {}
}

const manifestFile = (ctx: ScopeContext) => manifestPath(ctx.host.home)

async function setEnabled(ctx: ScopeContext, name: string, enabled: boolean) {
    const found = await locate(ctx, name)
    if (found.builtin) throw readOnly(name)
    const manifest = await ctx.manifest()
    if (enabled) {
        const entry = findDisabled(manifest, "skill", ctx.scope.id, name)
        if (!entry?.storedPath || !entry.originalPath) return {}
        await ctx.backup("ligar", `Ligar a skill ${name}`, [entry.storedPath, entry.originalPath, manifestFile(ctx)])
        await runOrFail(ctx.host, moveCommand(entry.storedPath, entry.originalPath), "Não foi possível ligar a skill")
        await ctx.saveManifest(withoutDisabled(manifest, "skill", ctx.scope.id, name))
        return {}
    }
    if (!found.file) return {}
    const stored = storedPathFor(ctx.host.home, ctx.scope.id, "skill", found.file.dir)
    await ctx.backup("desligar", `Desligar a skill ${name}`, [found.file.dir, stored, manifestFile(ctx)])
    await runOrFail(ctx.host, moveCommand(found.file.dir, stored), "Não foi possível desligar a skill")
    await ctx.saveManifest(withDisabled(manifest, { kind: "skill", scope: ctx.scope.id, name, originalPath: found.file.dir, storedPath: stored, configPath: null, disabledAt: new Date().toISOString() }))
    return {}
}

async function install(ctx: ScopeContext, input: { source: string; skills?: string[] }) {
    const before = new Set((await scan(ctx)).map((file) => file.name))
    await ctx.backup("instalar", `Instalar skills de ${input.source}`, [ctx.paths.newSkillRoot, ctx.paths.skillLockFile])
    await runOrFail(ctx.host, skillsAddCommand(input.source, input.skills ?? [], ctx.paths.directory), `Não foi possível instalar as skills de ${input.source}`, INSTALL_TIMEOUT_MS, { detached: true })
    const names = (await scan(ctx)).map((file) => file.name).filter((name) => !before.has(name))
    return { names }
}

async function updateVersions(ctx: ScopeContext, items: readonly OpencodeResourceDto[]) {
    const names = items.filter((item) => item.version && item.enabled).map((item) => item.name)
    if (names.length === 0) return { names }
    await ctx.backup("atualizar", `Atualizar skills: ${names.join(", ")}`, [...items.map((item) => item.path ?? "").filter(Boolean), ctx.paths.skillLockFile])
    await runOrFail(ctx.host, skillsUpdateCommand(names, ctx.paths.directory), "Não foi possível atualizar as skills", INSTALL_TIMEOUT_MS, { detached: true })
    return { names }
}

export const skillHandler: KindHandler = { list, get, create, update, remove, setEnabled, install, updateVersions }
