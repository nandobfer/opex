import { Types } from "mongoose"
import { FrontmatterError } from "@/features/opencode-resources/frontmatter"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { OpexSkill, type IOpexSkill, type IOpexSkillFile, type IOpexSkillOrigin } from "@/lib/db/models/Opex"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import {
    OPEX_SKILLS_EVENT,
    OPEX_SKILL_AUDIT_ENTITY,
    parseSkillMarkdown,
    skillSourceLabel,
    skillVersionOf,
    type OpexSkillCreateInput,
    type OpexSkillDetailDto,
    type OpexSkillDiscoveredDto,
    type OpexSkillDiscoveryDto,
    type OpexSkillDto,
    type OpexSkillEventAction,
    type OpexSkillFileDto,
    type OpexSkillInstallInput,
    type OpexSkillResultDto,
    type OpexSkillUpdateInput,
    type OpexSkillUpdateManyInput,
    type OpexSkillUsageDto,
} from "../../skills"
import { GITHUB_SOURCE_ERROR, parseGithubSkillSource, type GithubSkillSource } from "../../skill-source"
import { availableHashes, clearSkillTreeCache, fetchRepoTree, findSkillFolders, mapSkillsLimit, readSkillFolder, readSkillMarkdown, type RepoTree } from "./github"
import { assertSkillFitsDb, bytesOf, isTooLargeError, tooLargeError } from "./size"
import { routineAgentsUsingSkill, unlinkSkillFromRoutineAgents } from "./unlink"

/**
 * Skills do Agente Opex (OPE-153) — SOMENTE servidor. Um documento por skill em `opex_skills` (gravação
 * atômica; limite técnico de 16 MB por skill). Mutações validam, auditam (`SkillOpex`, sem conteúdo nem
 * token), registram log e publicam `opex-skills-updated` (`{ id, action }`) em `private-app`.
 */

const log = loggerFor({ module: "opex-skills" })

type SkillDoc = IOpexSkill & { _id: Types.ObjectId }
type SkillListDoc = Omit<SkillDoc, "body" | "files"> & { files: Omit<IOpexSkillFile, "content">[] }

const LIST_PROJECTION = { body: 0, "files.content": 0 } as const

const notFound = () => new DomainError(404, "Skill não encontrada (pode ter sido removida)", "OPEX_SKILL_NOT_FOUND")
const nameTaken = (name: string) => new DomainError(409, `Já existe uma skill com o nome "${name}" no Opex`, "OPEX_SKILL_NAME_TAKEN")

function assertId(id: string): void {
    if (!Types.ObjectId.isValid(id)) throw notFound()
}

async function loadDoc(id: string): Promise<SkillDoc> {
    assertId(id)
    await dbConnect()
    const doc = await OpexSkill.findById(id).lean<SkillDoc | null>()
    if (!doc) throw notFound()
    return doc
}

function toDto(doc: SkillListDoc, available: string | null = null): OpexSkillDto {
    const origin = { kind: doc.origin?.kind ?? "opex", repo: doc.origin?.repo ?? null, ref: doc.origin?.ref ?? null, path: doc.origin?.path ?? null }
    return {
        id: String(doc._id),
        name: doc.name,
        description: doc.description,
        enabled: doc.enabled !== false,
        origin,
        sourceLabel: skillSourceLabel(origin),
        version: origin.kind === "github" ? skillVersionOf(doc.hash, available) : null,
        size: doc.size ?? 0,
        fileCount: doc.files?.length ?? 0,
        updatedAt: new Date(doc.updatedAt ?? Date.now()).toISOString(),
    }
}

const sizeOf = (body: string, files: readonly Pick<IOpexSkillFile, "size">[]) => Buffer.byteLength(body, "utf8") + files.reduce((sum, file) => sum + file.size, 0)

function auditSnapshot(doc: Pick<IOpexSkill, "name" | "description" | "origin" | "hash" | "enabled" | "size" | "files">): Record<string, unknown> {
    return { nome: doc.name, descricao: doc.description, origem: skillSourceLabel(doc.origin), hash: doc.hash, ligada: doc.enabled, tamanho: doc.size, arquivos: doc.files.length }
}

async function afterChange(id: string, action: OpexSkillEventAction): Promise<void> {
    await publishAppEvent(OPEX_SKILLS_EVENT, { id, action })
}

async function assertNameFree(name: string): Promise<void> {
    const taken = await OpexSkill.findOne({ name }).select({ _id: 1 }).lean()
    if (taken) throw nameTaken(name)
}

/** Grava o documento novo; limite técnico e nome duplicado viram erros claros (nada parcial). */
async function insertSkill(fields: Omit<IOpexSkill, "createdAt" | "updatedAt">): Promise<SkillDoc> {
    assertSkillFitsDb(fields as unknown as Record<string, unknown>)
    try {
        const doc = await OpexSkill.create(fields)
        return doc.toObject() as SkillDoc
    } catch (error) {
        if (isTooLargeError(error)) throw tooLargeError(null)
        if ((error as { code?: number })?.code === 11000) throw nameTaken(fields.name)
        throw error
    }
}

async function replaceSkill(id: Types.ObjectId, set: Partial<IOpexSkill>, full: Record<string, unknown>): Promise<void> {
    assertSkillFitsDb(full)
    try {
        await OpexSkill.updateOne({ _id: id }, { $set: set })
    } catch (error) {
        if (isTooLargeError(error)) throw tooLargeError(null)
        throw error
    }
}

const textFile = (path: string, content: string): IOpexSkillFile => {
    const buffer = Buffer.from(content, "utf8")
    return { path, content: buffer, binary: false, size: buffer.byteLength }
}

/** Lista (sem conteúdo). Instaladas ganham o hash disponível no GitHub (cache de 10 min; `refresh` limpa). */
export async function listOpexSkills(options: { refresh?: boolean } = {}): Promise<OpexSkillDto[]> {
    await dbConnect()
    if (options.refresh) clearSkillTreeCache()
    const docs = await OpexSkill.find({}, LIST_PROJECTION).sort({ name: 1 }).lean<SkillListDoc[]>()
    const installed = docs.filter((doc) => doc.origin?.kind === "github" && doc.origin.repo && doc.hash)
    const hashes = await availableHashes(
        installed.map((doc) => ({ key: String(doc._id), repo: doc.origin.repo!, ref: doc.origin.ref ?? null, path: doc.origin.path ?? "" })),
        options.refresh,
    )
    return docs.map((doc) => toDto(doc, hashes.get(String(doc._id)) ?? null))
}

export async function getOpexSkill(id: string): Promise<OpexSkillDetailDto> {
    const doc = await loadDoc(id)
    return { ...toDto(doc), body: doc.body, files: doc.files.map((file) => ({ path: file.path, size: file.size, binary: file.binary })) }
}

/** Conteúdo de um arquivo de apoio (texto; binário volta só com os metadados). */
export async function readOpexSkillFile(id: string, path: string): Promise<OpexSkillFileDto> {
    const doc = await loadDoc(id)
    const file = doc.files.find((item) => item.path === path)
    if (!file) throw new DomainError(404, `Arquivo ${path} não encontrado na skill ${doc.name}`, "OPEX_SKILL_FILE_NOT_FOUND")
    return { path: file.path, size: file.size, binary: file.binary, content: file.binary ? null : bytesOf(file.content).toString("utf8") }
}

export async function createOpexSkill(input: OpexSkillCreateInput, actorId: string): Promise<OpexSkillDetailDto> {
    await dbConnect()
    await assertNameFree(input.name)
    const files = (input.files ?? []).map((file) => textFile(file.path, file.content))
    const fields = {
        name: input.name,
        description: input.description,
        body: input.body,
        extra: {},
        files,
        origin: { kind: "opex", repo: null, ref: null, path: null } satisfies IOpexSkillOrigin,
        hash: null,
        enabled: true,
        size: sizeOf(input.body, files),
    }
    const doc = await insertSkill(fields)
    const id = String(doc._id)
    await recordAudit({ userId: actorId, entidade: OPEX_SKILL_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.CRIAR, depois: auditSnapshot(fields) })
    log.info({ id, name: input.name, size: fields.size }, "[opex-skills] Skill criada")
    await afterChange(id, "created")
    return getOpexSkill(id)
}

/** Aplica as mudanças nos arquivos de apoio (binários de repositório não são editáveis). */
export function applyFileChanges(current: readonly IOpexSkillFile[], changes: OpexSkillUpdateInput["files"]): IOpexSkillFile[] {
    const files = new Map(current.map((file) => [file.path, file]))
    for (const change of changes ?? []) {
        const existing = files.get(change.path)
        if (change.content === null) {
            files.delete(change.path)
            continue
        }
        if (existing?.binary) throw new DomainError(400, `O arquivo ${change.path} é binário: só pode ser removido`, "OPEX_SKILL_READ_ONLY_FILE")
        files.set(change.path, textFile(change.path, change.content))
    }
    return [...files.values()].sort((a, b) => a.path.localeCompare(b.path))
}

/** Editar. Uma skill instalada continua vinculada à origem (Atualizar sobrescreve com o repositório). */
export async function updateOpexSkill(id: string, input: OpexSkillUpdateInput, actorId: string): Promise<OpexSkillDetailDto> {
    const before = await loadDoc(id)
    const files = applyFileChanges(before.files, input.files)
    const set = { description: input.description, body: input.body, files, size: sizeOf(input.body, files) }
    await replaceSkill(before._id, set, { ...before, ...set })
    await recordAudit({ userId: actorId, entidade: OPEX_SKILL_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: auditSnapshot(before), depois: auditSnapshot({ ...before, ...set }) })
    log.info({ id, name: before.name, size: set.size }, "[opex-skills] Skill editada")
    await afterChange(id, "updated")
    return getOpexSkill(id)
}

/** Switch: vale só para o Agente Opex do dono nas conversas (D2). */
export async function setOpexSkillEnabled(id: string, enabled: boolean, actorId: string): Promise<OpexSkillDto> {
    const before = await loadDoc(id)
    if (before.enabled !== enabled) {
        await OpexSkill.updateOne({ _id: before._id }, { $set: { enabled } })
        await recordAudit({ userId: actorId, entidade: OPEX_SKILL_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { ligada: before.enabled }, depois: { ligada: enabled } })
        log.info({ id, name: before.name, enabled }, "[opex-skills] Skill ligada/desligada")
        await afterChange(id, "toggled")
    }
    return toDto({ ...before, enabled })
}

export async function opexSkillUsage(id: string): Promise<OpexSkillUsageDto> {
    const doc = await loadDoc(id)
    return routineAgentsUsingSkill(doc.name)
}

/** Remover/desinstalar (D6): sai também da seleção dos rotineiros, com auditoria em cada um. */
export async function deleteOpexSkill(id: string, actorId: string): Promise<{ deleted: true; unlinked: number }> {
    const before = await loadDoc(id)
    await OpexSkill.deleteOne({ _id: before._id })
    const unlinked = await unlinkSkillFromRoutineAgents(before.name, actorId)
    await recordAudit({ userId: actorId, entidade: OPEX_SKILL_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: auditSnapshot(before), depois: { rotineirosDesvinculados: unlinked } })
    log.info({ id, name: before.name, unlinked }, "[opex-skills] Skill removida")
    await afterChange(id, "deleted")
    return { deleted: true, unlinked }
}

function sourceOf(raw: string): GithubSkillSource {
    const source = parseGithubSkillSource(raw)
    if (!source) throw new DomainError(400, GITHUB_SOURCE_ERROR, "OPEX_SKILL_SOURCE_INVALID")
    return source
}

async function repoTreeOf(source: GithubSkillSource): Promise<RepoTree> {
    const tree = await fetchRepoTree(source.repo, source.ref)
    if (tree.truncated) throw new DomainError(422, `O repositório ${source.repo} é grande demais para listar pela API do GitHub: informe a pasta da skill na URL (https://github.com/${source.repo}/tree/<branch>/<pasta>)`, "OPEX_SKILL_TREE_TRUNCATED")
    return tree
}

function skillFoldersOf(source: GithubSkillSource, tree: RepoTree): string[] {
    const folders = findSkillFolders(tree, source.path)
    if (folders.length === 0) throw new DomainError(404, `Nenhum SKILL.md encontrado em ${source.repo}${source.path ? `/${source.path}` : ""}`, "OPEX_SKILL_NO_SKILL_MD")
    return folders
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Skills de um repositório (pastas com `SKILL.md`), com o motivo das que não podem ser instaladas (D7). */
export async function discoverOpexSkills(raw: string): Promise<OpexSkillDiscoveryDto> {
    await dbConnect()
    const source = sourceOf(raw)
    const tree = await repoTreeOf(source)
    const folders = skillFoldersOf(source, tree)
    const existing = new Set((await OpexSkill.find({}).select({ name: 1 }).lean<{ name: string }[]>()).map((doc) => doc.name))
    const skills = await mapSkillsLimit(folders, 6, async (path): Promise<OpexSkillDiscoveredDto> => {
        try {
            const parsed = parseSkillMarkdown(await readSkillMarkdown(source.repo, tree, path))
            const exists = existing.has(parsed.name)
            return { path, name: parsed.name, description: parsed.description, exists, error: exists ? `Já existe uma skill com o nome "${parsed.name}" no Opex` : null }
        } catch (error) {
            if (error instanceof FrontmatterError || error instanceof DomainError) return { path, name: null, description: null, exists: false, error: error.message }
            throw error
        }
    })
    return { repo: source.repo, ref: source.ref, skills }
}

/** Instala as pastas marcadas; cada uma tem o seu resultado (D7: nome duplicado não impede as demais). */
export async function installOpexSkills(input: OpexSkillInstallInput, actorId: string): Promise<{ results: OpexSkillResultDto[] }> {
    await dbConnect()
    const source = sourceOf(input.source)
    const tree = await repoTreeOf(source)
    const folders = new Set(skillFoldersOf(source, tree))
    const results: OpexSkillResultDto[] = []
    for (const path of [...new Set(input.paths)]) {
        try {
            if (!folders.has(path)) throw new DomainError(404, `Nenhum SKILL.md em ${path || "raiz do repositório"}`, "OPEX_SKILL_NO_SKILL_MD")
            const folder = await readSkillFolder(source.repo, tree, path)
            const parsed = parseSkillMarkdown(folder.markdown)
            await assertNameFree(parsed.name)
            const fields = {
                name: parsed.name,
                description: parsed.description,
                body: parsed.body,
                extra: parsed.extra,
                files: folder.files,
                origin: { kind: "github", repo: source.repo, ref: source.ref, path } satisfies IOpexSkillOrigin,
                hash: folder.hash,
                enabled: true,
                size: sizeOf(parsed.body, folder.files),
            }
            const doc = await insertSkill(fields)
            const id = String(doc._id)
            await recordAudit({ userId: actorId, entidade: OPEX_SKILL_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.CRIAR, depois: auditSnapshot(fields) })
            log.info({ id, name: parsed.name, repo: source.repo, path }, "[opex-skills] Skill instalada")
            await afterChange(id, "installed")
            results.push({ key: path, name: parsed.name, ok: true, id, message: "Instalada" })
        } catch (error) {
            if (!(error instanceof DomainError || error instanceof FrontmatterError)) throw error
            results.push({ key: path, name: null, ok: false, id: null, message: messageOf(error) })
        }
    }
    return { results }
}

/**
 * Atualiza skills instaladas com a versão do repositório (sobrescreve edições locais; mantém nome e switch).
 * `all` = todas as instaladas com atualização. Falha no GitHub mantém a versão atual daquela skill.
 */
export async function updateOpexSkills(input: OpexSkillUpdateManyInput, actorId: string): Promise<{ results: OpexSkillResultDto[] }> {
    await dbConnect()
    const ids = input.all ? (await listOpexSkills({ refresh: true })).filter((skill) => skill.version?.outdated).map((skill) => skill.id) : (input.ids ?? [])
    const trees = new Map<string, Promise<RepoTree>>()
    const results: OpexSkillResultDto[] = []
    for (const id of ids) {
        let name: string | null = null
        try {
            const before = await loadDoc(id)
            name = before.name
            if (before.origin?.kind !== "github" || !before.origin.repo) throw new DomainError(400, "Skill criada no Opex não tem atualização", "OPEX_SKILL_NOT_INSTALLED")
            const { repo, ref } = before.origin
            const key = `${repo}@${ref ?? ""}`
            if (!trees.has(key)) trees.set(key, fetchRepoTree(repo, ref))
            const folder = await readSkillFolder(repo, await trees.get(key)!, before.origin.path ?? "")
            const parsed = parseSkillMarkdown(folder.markdown)
            const set = { description: parsed.description, body: parsed.body, extra: parsed.extra, files: folder.files, hash: folder.hash, size: sizeOf(parsed.body, folder.files) }
            await replaceSkill(before._id, set, { ...before, ...set })
            await recordAudit({ userId: actorId, entidade: OPEX_SKILL_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: auditSnapshot(before), depois: auditSnapshot({ ...before, ...set }) })
            log.info({ id, name, from: before.hash, to: folder.hash }, "[opex-skills] Skill atualizada do GitHub")
            await afterChange(id, "updated")
            const renamed = parsed.name !== before.name ? ` (o repositório agora a chama "${parsed.name}"; o nome no Opex continua "${before.name}")` : ""
            results.push({ key: id, name, ok: true, id, message: `Atualizada para ${folder.hash.slice(0, 7)}${renamed}` })
        } catch (error) {
            if (!(error instanceof DomainError || error instanceof FrontmatterError)) throw error
            log.warn({ id, err: messageOf(error) }, "[opex-skills] Falha ao atualizar skill")
            results.push({ key: id, name, ok: false, id, message: `${messageOf(error)} — a versão atual foi mantida` })
        }
    }
    clearSkillTreeCache()
    return { results }
}

/** Catálogo (nome + descrição) para o agente: ligadas (chat do dono) ou por nome (rotineiro, D2). */
export async function loadSkillCatalog(filter: { names?: readonly string[]; onlyEnabled?: boolean }): Promise<{ name: string; description: string }[]> {
    if (filter.names && filter.names.length === 0) return []
    await dbConnect()
    const query: Record<string, unknown> = {}
    if (filter.names) query.name = { $in: [...filter.names] }
    if (filter.onlyEnabled) query.enabled = { $ne: false }
    const docs = await OpexSkill.find(query).select({ name: 1, description: 1 }).sort({ name: 1 }).lean<{ name: string; description: string }[]>()
    return docs.map((doc) => ({ name: doc.name, description: doc.description }))
}

/** Skill completa pelo nome (carregamento sob demanda pelas ferramentas do turno). */
export async function loadSkillByName(name: string): Promise<SkillDoc | null> {
    await dbConnect()
    return OpexSkill.findOne({ name }).lean<SkillDoc | null>()
}

/** Nomes que existem entre os informados (validação da seleção dos rotineiros). */
export async function existingSkillNames(names: readonly string[]): Promise<Set<string>> {
    if (names.length === 0) return new Set()
    await dbConnect()
    const docs = await OpexSkill.find({ name: { $in: [...names] } }).select({ name: 1 }).lean<{ name: string }[]>()
    return new Set(docs.map((doc) => doc.name))
}
