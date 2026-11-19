import { dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { Plugin, PluginVersion, type IPlugin, type IPluginVersion } from "@/lib/db/models/Plugin"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { publishAppEvent, publishClientEvent } from "@/lib/pusher/channels"
import { loggerFor } from "@/lib/logger"
import { PLUGIN_CHANGE_SUMMARY_MAX, PLUGIN_UPDATED_EVENT, type PluginChannel, type PluginScope } from "../constants"
import { diffPluginFiles, pluginPreviewPath, pluginSlotsOf, versionActionBlock } from "../logic"
import { isPluginTestFile, manifestScopeIssue, normalizePluginFiles, parsePluginManifest, type PluginSourceFile } from "../manifest"
import type { PluginDetailDto, PluginDiffDto, PluginDto, PluginUpdatedPayload, PluginVersionDetailDto, PluginVersionSummaryDto } from "../types"

/**
 * Serviço dos plugins (OPE-172): cadastro, versões (`draft` → `preview` → `stable`), rollback,
 * ativar/desativar, diff e a sincronização com o kernel (código de servidor dos plugins do dono).
 * Toda mutação grava auditoria e publica `plugin-updated` no canal do escopo.
 */

const log = () => loggerFor({ module: "plugins.service" })
const ENTITY = "plugin"

type Lean<T> = T & { _id: { toString(): string } }
type PluginDoc = Lean<IPlugin>
type VersionDoc = Lean<IPluginVersion>

/** Restrição do ator: o portal só enxerga os plugins do próprio cliente. */
export type PluginAccess = { kind: "owner" } | { kind: "client"; clientId: string }
export const OWNER_ACCESS: PluginAccess = { kind: "owner" }

function summaryOf(version: VersionDoc): PluginVersionSummaryDto {
    return {
        id: String(version._id),
        number: version.number,
        state: version.state,
        author: version.author,
        source: { taskId: version.source?.taskId ?? null, taskCode: version.source?.taskCode ?? null, workbenchId: version.source?.workbenchId ?? null },
        baseVersionId: version.baseVersionId ?? null,
        tests: version.tests ?? [],
        hasServer: Boolean(version.artifacts?.server),
        hasClient: Boolean(version.artifacts?.client),
        createdAt: new Date(version.createdAt).toISOString(),
        promotedAt: version.promotedAt ? new Date(version.promotedAt).toISOString() : null,
        slots: pluginSlotsOf(version.manifest),
        previewPath: pluginPreviewPath({ pluginId: version.pluginId, scope: version.manifest?.scope ?? "owner" }, { pages: version.manifest?.pages ?? [], slots: version.manifest?.slots ?? [] }),
        changeSummary: version.changeSummary ?? null,
        changeSummarySource: version.changeSummarySource ?? null,
    }
}

const SUMMARY_PROJECTION = { files: 0, "artifacts.server.code": 0, "artifacts.client.code": 0, "artifacts.client.css": 0, compileLog: 0 }

async function clientNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map()
    const docs = await OrcamentoClient.find({ _id: { $in: ids } }, { name: 1 }).lean()
    return new Map(docs.map((doc) => [String(doc._id), doc.name]))
}

async function toDtos(plugins: PluginDoc[]): Promise<PluginDto[]> {
    const versionIds = plugins.flatMap((plugin) => [plugin.stableVersionId, plugin.previewVersionId]).filter((id): id is string => Boolean(id))
    const versions = versionIds.length ? ((await PluginVersion.find({ _id: { $in: versionIds } }, SUMMARY_PROJECTION).lean()) as VersionDoc[]) : []
    const byId = new Map(versions.map((version) => [String(version._id), summaryOf(version)]))
    const names = await clientNames([...new Set(plugins.map((plugin) => plugin.clientId).filter((id): id is string => Boolean(id)))])
    return plugins.map((plugin) => ({
        id: plugin.pluginId,
        name: plugin.name,
        description: plugin.description,
        scope: plugin.scope,
        clientId: plugin.clientId,
        clientName: plugin.clientId ? (names.get(plugin.clientId) ?? null) : null,
        apiVersion: plugin.apiVersion,
        active: plugin.active,
        archivedAt: plugin.archivedAt ? new Date(plugin.archivedAt).toISOString() : null,
        stable: plugin.stableVersionId ? (byId.get(plugin.stableVersionId) ?? null) : null,
        preview: plugin.previewVersionId ? (byId.get(plugin.previewVersionId) ?? null) : null,
        slots: (plugin.stableVersionId ? byId.get(plugin.stableVersionId) : undefined)?.slots ?? (plugin.previewVersionId ? byId.get(plugin.previewVersionId) : undefined)?.slots ?? [],
        previewWorkbenchId: plugin.previewWorkbenchId,
        runtimeError: plugin.runtimeError ? { ...plugin.runtimeError, at: new Date(plugin.runtimeError.at).toISOString() } : null,
        createdAt: new Date(plugin.createdAt).toISOString(),
        updatedAt: new Date(plugin.updatedAt).toISOString(),
    }))
}

function accessFilter(access: PluginAccess): Record<string, unknown> {
    return access.kind === "client" ? { scope: "client", clientId: access.clientId } : {}
}

export interface PluginListFilter {
    scope?: PluginScope
    clientId?: string
}

export async function listPlugins(access: PluginAccess = OWNER_ACCESS, filter: PluginListFilter = {}): Promise<PluginDto[]> {
    await dbConnect()
    const query: Record<string, unknown> = { ...accessFilter(access) }
    if (access.kind === "owner") {
        if (filter.scope) query.scope = filter.scope
        if (filter.clientId) query.clientId = filter.clientId
    }
    const plugins = (await Plugin.find(query).sort({ name: 1 }).lean()) as PluginDoc[]
    return toDtos(plugins)
}

async function loadPlugin(pluginId: string, access: PluginAccess = OWNER_ACCESS): Promise<PluginDoc> {
    await dbConnect()
    const plugin = (await Plugin.findOne({ pluginId, ...accessFilter(access) }).lean()) as PluginDoc | null
    if (!plugin) throw new DomainError(404, "Plugin não encontrado", "PLUGIN_NOT_FOUND")
    return plugin
}

async function loadVersion(pluginId: string, versionId: string): Promise<VersionDoc> {
    if (!/^[a-f0-9]{24}$/.test(versionId)) throw new DomainError(404, "Versão não encontrada", "PLUGIN_VERSION_NOT_FOUND")
    const version = (await PluginVersion.findOne({ _id: versionId, pluginId }).lean()) as VersionDoc | null
    if (!version) throw new DomainError(404, "Versão não encontrada", "PLUGIN_VERSION_NOT_FOUND")
    return version
}

export async function getPlugin(pluginId: string, access: PluginAccess = OWNER_ACCESS): Promise<PluginDetailDto> {
    const plugin = await loadPlugin(pluginId, access)
    const [dto] = await toDtos([plugin])
    const versions = (await PluginVersion.find({ pluginId }, SUMMARY_PROJECTION).sort({ number: -1 }).lean()) as VersionDoc[]
    return { ...dto!, versions: versions.map(summaryOf) }
}

/** Plugin arquivado não muda de versão, de prévia nem de estado: desarquive antes. */
export function assertNotArchived(plugin: Pick<IPlugin, "archivedAt" | "name">): void {
    if (plugin.archivedAt) throw new DomainError(409, `O plugin ${plugin.name} está arquivado. Desarquive-o antes`, "PLUGIN_ARCHIVED")
}

export async function findPlugin(pluginId: string): Promise<PluginDoc | null> {
    await dbConnect()
    return (await Plugin.findOne({ pluginId }).lean()) as PluginDoc | null
}

export async function getPluginVersion(pluginId: string, versionId: string, access: PluginAccess = OWNER_ACCESS): Promise<PluginVersionDetailDto> {
    await loadPlugin(pluginId, access)
    const version = await loadVersion(pluginId, versionId)
    return { ...summaryOf(version), pluginId, manifest: version.manifest, files: version.files.map((file) => ({ path: file.path, content: file.content })), compileLog: version.compileLog }
}

/** Fontes de uma versão (exportação para a pasta de trabalho da mesa). */
export async function pluginVersionFiles(pluginId: string, versionId: string): Promise<PluginSourceFile[]> {
    await dbConnect()
    const version = await loadVersion(pluginId, versionId)
    return version.files.map((file) => ({ path: file.path, content: file.content }))
}

/** Diff entre duas versões (sem `from`: a base da versão `to`, ou vazio). */
export async function diffPluginVersions(pluginId: string, toVersionId: string, fromVersionId: string | null, access: PluginAccess = OWNER_ACCESS): Promise<PluginDiffDto> {
    await loadPlugin(pluginId, access)
    const to = await loadVersion(pluginId, toVersionId)
    const fromId = fromVersionId ?? to.baseVersionId
    const from = fromId ? await loadVersion(pluginId, fromId) : null
    return {
        from: from ? { id: String(from._id), number: from.number } : null,
        to: { id: String(to._id), number: to.number },
        files: diffPluginFiles(from?.files ?? [], to.files),
    }
}

export async function publishPluginUpdated(plugin: Pick<IPlugin, "pluginId" | "scope" | "clientId">, payload: Omit<PluginUpdatedPayload, "id">): Promise<void> {
    const event: PluginUpdatedPayload = { id: plugin.pluginId, ...payload }
    await publishAppEvent(PLUGIN_UPDATED_EVENT, { ...event })
    if (plugin.scope === "client" && plugin.clientId) await publishClientEvent(plugin.clientId, PLUGIN_UPDATED_EVENT, { ...event })
}

export interface CreatePluginInput {
    pluginId: string
    name: string
    description?: string
    scope: PluginScope
    clientId: string | null
    actorId: string
}

/** Cadastra o plugin (sem versão; a primeira vem da mesa). */
export async function createPluginRecord(input: CreatePluginInput): Promise<PluginDoc> {
    await dbConnect()
    if (input.scope === "client" && !input.clientId) throw new DomainError(400, "Plugin de cliente exige o cliente", "PLUGIN_CLIENT_REQUIRED")
    const exists = await Plugin.exists({ pluginId: input.pluginId })
    if (exists) throw new DomainError(409, `Já existe um plugin com o id "${input.pluginId}"`, "PLUGIN_EXISTS")
    const created = await Plugin.create({
        pluginId: input.pluginId,
        name: input.name,
        description: input.description ?? "",
        scope: input.scope,
        clientId: input.scope === "client" ? input.clientId : null,
        apiVersion: "1.0",
        createdBy: input.actorId,
    })
    await recordAudit({ userId: input.actorId, entidade: ENTITY, entidadeId: input.pluginId, acao: "CRIAR", depois: { pluginId: input.pluginId, name: input.name, scope: input.scope, clientId: input.clientId } })
    await publishPluginUpdated(created, { version: null, channel: null })
    return created.toObject() as PluginDoc
}

export interface DraftInput {
    pluginId: string
    files: PluginSourceFile[]
    baseVersionId: string | null
    source: { taskId: string | null; taskCode: string | null; workbenchId: string | null }
    author: string
    /** Descritivo da mudança escrito pelo agente da mesa (pt-BR, sem código). */
    changeSummary?: string | null
}

export type DraftResult = { ok: true; versionId: string; number: number; log: string } | { ok: false; issues: string[] }

/**
 * Valida o manifesto, compila (Rolldown) e grava a versão `draft`. Falha de manifesto ou de
 * compilação não grava nada e devolve os problemas em pt-BR (a mesa abre um turno de correção).
 */
export async function createDraftVersion(input: DraftInput): Promise<DraftResult> {
    const plugin = await loadPlugin(input.pluginId)
    const files = normalizePluginFiles(input.files)
    const parsed = parsePluginManifest(files)
    if (!parsed.ok) return { ok: false, issues: parsed.issues }
    const scopeIssue = manifestScopeIssue(parsed.manifest, { id: plugin.pluginId, scope: plugin.scope })
    if (scopeIssue) return { ok: false, issues: [scopeIssue] }
    const { compilePluginSources } = await import("./compiler/rolldown")
    const compiled = await compilePluginSources(files, parsed.manifest)
    if (!compiled.ok) return { ok: false, issues: compiled.errors }

    const last = await PluginVersion.findOne({ pluginId: plugin.pluginId }, { number: 1 }).sort({ number: -1 }).lean()
    const created = await PluginVersion.create({
        pluginId: plugin.pluginId,
        number: (last?.number ?? 0) + 1,
        state: "draft",
        files,
        manifest: parsed.manifest,
        artifacts: { server: compiled.server, client: compiled.client },
        tests: files.map((file) => file.path).filter(isPluginTestFile),
        compileLog: compiled.log,
        baseVersionId: input.baseVersionId,
        author: input.author,
        source: input.source,
        ...(input.changeSummary?.trim() ? { changeSummary: input.changeSummary.trim().slice(0, PLUGIN_CHANGE_SUMMARY_MAX), changeSummarySource: "agent" } : {}),
    })
    await Plugin.updateOne({ pluginId: plugin.pluginId }, { $set: { name: parsed.manifest.name, description: parsed.manifest.description, apiVersion: parsed.manifest.apiVersion } })
    await recordAudit({ userId: input.author, entidade: ENTITY, entidadeId: plugin.pluginId, acao: "CRIAR", depois: { versao: created.number, estado: "draft", tarefa: input.source.taskCode } })
    await publishPluginUpdated(plugin, { version: created.number, channel: null })
    return { ok: true, versionId: String(created._id), number: created.number, log: compiled.log }
}

/** Ativa (ou troca) o código de servidor de um canal; erro vira `runtimeError` do plugin. */
async function activateChannel(plugin: PluginDoc, version: VersionDoc, channel: PluginChannel): Promise<string | null> {
    if (plugin.scope !== "owner") return null
    const { activatePluginServer } = await import("./kernel/kernel")
    const result = await activatePluginServer({ pluginId: plugin.pluginId, channel, versionId: String(version._id), manifest: version.manifest, artifact: version.artifacts?.server ?? null })
    return result.ok ? null : result.error
}

async function setRuntimeError(pluginId: string, error: { channel: PluginChannel; versionId: string; message: string } | null, channel?: PluginChannel): Promise<void> {
    if (error) await Plugin.updateOne({ pluginId }, { $set: { runtimeError: { ...error, at: new Date() } } })
    else await Plugin.updateOne({ pluginId, ...(channel ? { "runtimeError.channel": channel } : {}) }, { $set: { runtimeError: null } })
}

/** Número de uma versão para as mensagens (`v3`), ou "nenhuma". */
async function versionLabel(pluginId: string, versionId: string | null): Promise<string> {
    if (!versionId) return "nenhuma"
    const version = await PluginVersion.findOne({ _id: versionId, pluginId }, { number: 1 }).lean()
    return version ? `v${version.number}` : "desconhecida"
}

/**
 * A versão precisa ter partido da estável ATUAL: senão, consolidá-la apagaria o que outra mesa
 * consolidou nesse meio-tempo. Recusa com 409 `PLUGIN_BASE_OUTDATED` (a mesa refaz a partir da estável).
 */
async function assertBaseIsCurrentStable(plugin: PluginDoc, version: VersionDoc): Promise<void> {
    const base = version.baseVersionId ?? null
    const stable = plugin.stableVersionId ?? null
    if (base === stable) return
    throw new DomainError(
        409,
        `A versão v${version.number} partiu da estável ${await versionLabel(plugin.pluginId, base)}, mas a estável agora é ${await versionLabel(plugin.pluginId, stable)}. Refaça a alteração a partir da estável atual`,
        "PLUGIN_BASE_OUTDATED",
    )
}

/** A prévia é de uma mesa só: outra mesa não troca nem rebaixa a prévia que não é dela. */
async function assertPreviewFree(plugin: PluginDoc, workbenchId: string | null): Promise<void> {
    if (!plugin.previewVersionId || !plugin.previewWorkbenchId || plugin.previewWorkbenchId === workbenchId) return
    const current = await PluginVersion.findOne({ _id: plugin.previewVersionId, pluginId: plugin.pluginId }, { number: 1, source: 1 }).lean()
    const owner = current?.source?.taskCode ? ` da tarefa ${current.source.taskCode}` : " de outra mesa"
    throw new DomainError(409, `O plugin já tem uma prévia${owner}${current ? ` (v${current.number})` : ""}. Aguarde ela ser consolidada ou descartada`, "PLUGIN_PREVIEW_BUSY")
}

/** Publica a versão como prévia (só para quem estiver com a prévia ligada). */
export async function publishPreviewVersion(pluginId: string, versionId: string, options: { workbenchId: string | null; actorId: string }): Promise<{ number: number; runtimeError: string | null }> {
    const plugin = await loadPlugin(pluginId)
    const version = await loadVersion(pluginId, versionId)
    const block = versionActionBlock("publish-preview", version.state)
    if (block) throw new DomainError(409, block, "PLUGIN_VERSION_STATE")
    assertNotArchived(plugin)
    await assertPreviewFree(plugin, options.workbenchId)
    await assertBaseIsCurrentStable(plugin, version)

    const runtimeError = plugin.active ? await activateChannel(plugin, version, "preview") : null
    if (plugin.previewVersionId && plugin.previewVersionId !== versionId) await PluginVersion.updateOne({ _id: plugin.previewVersionId, state: "preview" }, { $set: { state: "draft" } })
    await PluginVersion.updateOne({ _id: versionId }, { $set: { state: "preview" } })
    await Plugin.updateOne({ pluginId }, { $set: { previewVersionId: versionId, previewWorkbenchId: options.workbenchId } })
    await setRuntimeError(pluginId, runtimeError ? { channel: "preview", versionId, message: runtimeError } : null, "preview")
    await recordAudit({ userId: options.actorId, entidade: ENTITY, entidadeId: pluginId, acao: "ATUALIZAR", antes: { previa: plugin.previewVersionId }, depois: { previa: versionId, versao: version.number } })
    await publishPluginUpdated(plugin, { version: version.number, channel: "preview" })
    return { number: version.number, runtimeError }
}

/** Descarta a prévia (a versão volta a rascunho; a fiber de prévia é desfeita). */
export async function discardPreview(pluginId: string, actorId: string): Promise<void> {
    const plugin = await loadPlugin(pluginId)
    if (!plugin.previewVersionId) return
    await PluginVersion.updateOne({ _id: plugin.previewVersionId, state: "preview" }, { $set: { state: "draft" } })
    await Plugin.updateOne({ pluginId }, { $set: { previewVersionId: null, previewWorkbenchId: null } })
    await setRuntimeError(pluginId, null, "preview")
    if (plugin.scope === "owner") {
        const { deactivatePluginServer } = await import("./kernel/kernel")
        await deactivatePluginServer(pluginId, "preview")
    }
    await recordAudit({ userId: actorId, entidade: ENTITY, entidadeId: pluginId, acao: "ATUALIZAR", antes: { previa: plugin.previewVersionId }, depois: { previa: null } })
    await publishPluginUpdated(plugin, { version: null, channel: "preview" })
}

/** Torna `versionId` a stable (consolidação ou rollback). Transacional: o servidor ativa antes de gravar. */
async function promoteToStable(plugin: PluginDoc, version: VersionDoc, actorId: string, kind: "consolidate" | "rollback"): Promise<void> {
    const versionId = String(version._id)
    if (plugin.active) {
        const error = await activateChannel(plugin, version, "stable")
        if (error) {
            await setRuntimeError(plugin.pluginId, { channel: "stable", versionId, message: error })
            throw new DomainError(409, `${error}. A versão estável anterior continua ativa.`, "PLUGIN_ACTIVATION_FAILED")
        }
    }
    if (plugin.stableVersionId && plugin.stableVersionId !== versionId) await PluginVersion.updateOne({ _id: plugin.stableVersionId }, { $set: { state: "archived" } })
    await PluginVersion.updateOne({ _id: versionId }, { $set: { state: "stable", promotedAt: new Date() } })
    const unset: Record<string, unknown> = kind === "consolidate" || plugin.previewVersionId === versionId ? { previewVersionId: null, previewWorkbenchId: null } : {}
    await Plugin.updateOne({ pluginId: plugin.pluginId }, { $set: { stableVersionId: versionId, apiVersion: version.manifest.apiVersion, ...unset } })
    await setRuntimeError(plugin.pluginId, null)
    if (unset.previewVersionId === null && plugin.scope === "owner") {
        const { deactivatePluginServer } = await import("./kernel/kernel")
        await deactivatePluginServer(plugin.pluginId, "preview")
    }
    await recordAudit({
        userId: actorId,
        entidade: ENTITY,
        entidadeId: plugin.pluginId,
        acao: kind === "consolidate" ? "APROVAR" : "ATUALIZAR",
        antes: { estavel: plugin.stableVersionId },
        depois: { estavel: versionId, versao: version.number, ...(kind === "rollback" ? { rollback: true } : {}) },
    })
    await publishPluginUpdated(plugin, { version: version.number, channel: "stable" })
}

/** Consolida a prévia como a versão definitiva (`stable`). */
export async function consolidateVersion(pluginId: string, versionId: string, actorId: string): Promise<{ number: number }> {
    const plugin = await loadPlugin(pluginId)
    const version = await loadVersion(pluginId, versionId)
    const block = versionActionBlock("consolidate", version.state)
    if (block) throw new DomainError(409, block, "PLUGIN_VERSION_STATE")
    assertNotArchived(plugin)
    await assertBaseIsCurrentStable(plugin, version)
    await promoteToStable(plugin, version, actorId, "consolidate")
    return { number: version.number }
}

/** Rollback com um clique: volta a stable para uma versão consolidada antes. */
export async function rollbackPlugin(pluginId: string, versionId: string, actorId: string, access: PluginAccess = OWNER_ACCESS): Promise<{ number: number }> {
    const plugin = await loadPlugin(pluginId, access)
    const version = await loadVersion(pluginId, versionId)
    const block = versionActionBlock("rollback", version.state, { isCurrentStable: plugin.stableVersionId === versionId })
    if (block) throw new DomainError(409, block, "PLUGIN_VERSION_STATE")
    if (!version.promotedAt) throw new DomainError(409, "O rollback só volta para uma versão já consolidada antes", "PLUGIN_VERSION_STATE")
    assertNotArchived(plugin)
    await promoteToStable(plugin, version, actorId, "rollback")
    return { number: version.number }
}

/** Ativa ou desativa o plugin (desativar desfaz o código de servidor e tira a interface das telas). */
export async function setPluginActive(pluginId: string, active: boolean, actorId: string, access: PluginAccess = OWNER_ACCESS): Promise<void> {
    const plugin = await loadPlugin(pluginId, access)
    if (plugin.active === active) return
    if (active) assertNotArchived(plugin)
    await Plugin.updateOne({ pluginId }, { $set: { active } })
    if (plugin.scope === "owner") {
        if (active) await syncPluginServer(pluginId)
        else {
            const { deactivatePluginServer } = await import("./kernel/kernel")
            await deactivatePluginServer(pluginId)
        }
    }
    await recordAudit({ userId: actorId, entidade: ENTITY, entidadeId: pluginId, acao: "ATUALIZAR", antes: { ativo: plugin.active }, depois: { ativo: active } })
    await publishPluginUpdated(plugin, { version: null, channel: null })
}

/**
 * Arquiva ou desarquiva. Arquivar desliga o plugin (tira das telas e do kernel) e é recusado com uma
 * prévia de mesa em andamento; desarquivar volta DESLIGADO (o ator liga de propósito). Nada é apagado.
 */
export async function setPluginArchived(pluginId: string, archived: boolean, actorId: string, access: PluginAccess = OWNER_ACCESS): Promise<{ archived: boolean; changed: boolean }> {
    const plugin = await loadPlugin(pluginId, access)
    if (Boolean(plugin.archivedAt) === archived) return { archived, changed: false }
    if (archived && plugin.previewVersionId) {
        const current = await PluginVersion.findOne({ _id: plugin.previewVersionId, pluginId }, { number: 1, source: 1 }).lean()
        const owner = current?.source?.taskCode ? ` da tarefa ${current.source.taskCode}` : ""
        throw new DomainError(409, `O plugin tem uma prévia${owner}. Conclua ou descarte antes de arquivar`, "PLUGIN_PREVIEW_BUSY")
    }
    const set = archived ? { archivedAt: new Date(), archivedBy: actorId, active: false } : { archivedAt: null, archivedBy: null, active: false }
    await Plugin.updateOne({ pluginId }, { $set: set })
    if (archived && plugin.active && plugin.scope === "owner") {
        const { deactivatePluginServer } = await import("./kernel/kernel")
        await deactivatePluginServer(pluginId)
    }
    await recordAudit({ userId: actorId, entidade: ENTITY, entidadeId: pluginId, acao: "ATUALIZAR", antes: { arquivado: Boolean(plugin.archivedAt), ativo: plugin.active }, depois: { arquivado: archived, ativo: false } })
    await publishPluginUpdated(plugin, { version: null, channel: null })
    return { archived, changed: true }
}

/**
 * Reconcilia o kernel com o banco para um plugin do dono: ativa a stable e a prévia vigentes e
 * desfaz o que não vale mais. Erro de ativação fica em `runtimeError` (a fiber anterior continua).
 */
export async function syncPluginServer(pluginId: string): Promise<void> {
    const plugin = await loadPlugin(pluginId)
    if (plugin.scope !== "owner") return
    const { deactivatePluginServer } = await import("./kernel/kernel")
    for (const channel of ["stable", "preview"] as const) {
        const versionId = channel === "stable" ? plugin.stableVersionId : plugin.previewVersionId
        if (!plugin.active || plugin.archivedAt || !versionId) {
            await deactivatePluginServer(pluginId, channel)
            continue
        }
        const version = await loadVersion(pluginId, versionId).catch(() => null)
        if (!version) continue
        const error = await activateChannel(plugin, version, channel)
        if (error) {
            log().warn({ pluginId, channel, versionId, error }, "[plugins] Falha ao ativar na sincronização")
            await setRuntimeError(pluginId, { channel, versionId, message: error })
        } else if (plugin.runtimeError?.channel === channel) await setRuntimeError(pluginId, null, channel)
    }
}

/** Sobe todos os plugins ativos do dono (boot do kernel). */
export async function syncAllPluginServers(): Promise<void> {
    await dbConnect()
    const plugins = await Plugin.find({ scope: "owner", active: true, archivedAt: null }, { pluginId: 1 }).lean()
    for (const plugin of plugins) {
        try {
            await syncPluginServer(plugin.pluginId)
        } catch (error) {
            log().error({ err: error, pluginId: plugin.pluginId }, "[plugins] Falha ao sincronizar o plugin no boot")
        }
    }
}

/**
 * Reconciliação periódica (tick do agendador, OPE-172): compara, para cada plugin do dono, a versão que
 * o banco manda carregar em cada canal com a fiber viva neste processo e chama `syncPluginServer` só
 * quando divergem. Cobre as mudanças gravadas por outra instância (uma prévia do Opex usa o mesmo banco,
 * mas não ativa código de servidor): rollback, desativar, arquivar ou consolidar feitos lá passam a valer
 * aqui em até um tick. Versão sem servidor conta como "nada carregado"; um erro de ativação já registrado
 * para a mesma versão não é retentado a cada tick.
 */
export async function reconcilePluginServers(): Promise<string[]> {
    const { kernelMode, loadedPluginFiber } = await import("./kernel/kernel")
    if ((await kernelMode()) === "preview-instance") return []
    await dbConnect()
    const plugins = (await Plugin.find({ scope: "owner" }, { pluginId: 1, active: 1, archivedAt: 1, stableVersionId: 1, previewVersionId: 1, runtimeError: 1 }).lean()) as PluginDoc[]
    const versionIds = plugins.flatMap((plugin) => [plugin.stableVersionId, plugin.previewVersionId]).filter((id): id is string => Boolean(id))
    const withServer = new Set(
        versionIds.length ? ((await PluginVersion.find({ _id: { $in: versionIds }, "artifacts.server": { $ne: null } }, { _id: 1 }).lean()) as VersionDoc[]).map((version) => String(version._id)) : [],
    )
    const synced: string[] = []
    for (const plugin of plugins) {
        let diverged = false
        for (const channel of ["stable", "preview"] as const) {
            const versionId = channel === "stable" ? plugin.stableVersionId : plugin.previewVersionId
            const wanted = plugin.active && !plugin.archivedAt && versionId && withServer.has(versionId) ? versionId : null
            const loaded = (await loadedPluginFiber(plugin.pluginId, channel))?.versionId ?? null
            if (wanted === loaded) continue
            if (wanted && plugin.runtimeError?.channel === channel && plugin.runtimeError.versionId === wanted) continue
            diverged = true
        }
        if (!diverged) continue
        try {
            await syncPluginServer(plugin.pluginId)
            synced.push(plugin.pluginId)
        } catch (error) {
            log().error({ err: error, pluginId: plugin.pluginId }, "[plugins] Falha ao reconciliar o plugin com o banco")
        }
    }
    return synced
}
