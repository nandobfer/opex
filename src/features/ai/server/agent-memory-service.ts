import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { integrationChannel } from "@/lib/pusher/channel-names"
import { publishToChannels } from "@/lib/pusher/channels"
import { engramindCall, type EngramindTarget } from "@/features/engramind/server/client"
import { engramindCodeOf } from "@/features/engramind/server/errors"
import type { EngramindMemory, MemoryWrite } from "@/features/engramind/types"
import { AI_AGENTS, MEMORY_CONSUMER_DEFS, MEMORY_CONSUMERS, isAiAgentId, memoryChannelName, memoryChannelOf, type AiAgentId, type MemoryConsumer, type MemoryIdentity, type MemoryListScope } from "../agents"
import { AI_MEMORIES_UPDATED_EVENT, AI_MEMORY_AUDIT_ENTITY } from "../constants"
import { firstSentence, memoryTextSchema } from "../memory-text"
import { sortMemories } from "../memory-list"
import type { AgentMemoryOrigin, MemoryDto, MemoryMutationResult } from "../types"
import { memoryLimitsFor, memorySettings } from "./memory-settings"

/**
 * Memórias (instruções permanentes) dos agentes de IA — desde a OPE-104 a fonte é o **Engramind**:
 * cada lista do catálogo `agents.ts` é um canal, lido e gravado pelo cliente da integração
 * (`engramindCall`). As listas por central e por cliente exigem o id (o canal nasce na primeira
 * gravação). A auditoria `MemoriaAgente`, o log e o evento `ai-memories-updated` continuam no Opex.
 *
 * Quem grava:
 * - o **dono** (tela, ferramentas de gestão do Agente Opex): token admin do Opex, `origin` `dono`;
 * - o **Agente Mentor**: token admin, com a origem dele (`Mentor · <tarefa>`);
 * - um **agente sozinho** (aprendizado autônomo): o token do próprio agente, `origin` = o agente. Ele
 *   pode editar a memória do dono (o Engramind guarda o histórico), mas não excluí-la nem inativá-la
 *   (`OWNER_MEMORY_PROTECTED`).
 */

const log = loggerFor({ module: "ai", feature: "agent-memories" })

export const OWNER_MEMORY_ORIGIN: AgentMemoryOrigin = { source: "dono", label: "Dono" }
const OWNER_SOURCES = new Set([OWNER_MEMORY_ORIGIN.source])
const PAGE_LIMIT = 200
const MAX_PAGES = 25

export function assertAgentId(agentId: string): AiAgentId {
    if (!isAiAgentId(agentId)) throw new DomainError(404, "Agente não encontrado", "AI_AGENT_NOT_FOUND")
    return agentId
}

/** Agente que grava sozinho (aprendizado autônomo). */
export interface MemoryAgentActor {
    /** Consumidor (aprendizado autônomo) ou o Agente Mentor, cada um com o próprio token. */
    consumer: MemoryIdentity
    /** Rótulo da origem ("Agente desenvolvedor · OPE-12"). */
    label: string
}

/** Opções de quem grava a memória (Mentor, agente sozinho) e da lista (central/cliente). */
export interface AgentMemoryWriteOptions extends MemoryListScope {
    /** Origem gravada no Engramind (nunca no texto). Padrão: o dono. */
    origin?: AgentMemoryOrigin | null
    /** Contexto extra da auditoria (vai para o `depois`). */
    auditContext?: Record<string, unknown>
    categoria?: string | null
    fixada?: boolean
    /** Gravação autônoma de um agente (token do agente, proteção das memórias do dono). */
    agent?: MemoryAgentActor
}

/** Alterações de uma memória (tela, ferramentas e Mentor). */
export interface MemoryPatch {
    texto?: string
    categoria?: string
    /** Versão lida (`expected_version`): diferente da atual → 409 `MEMORY_VERSION_CONFLICT`. */
    versao?: number
    fixada?: boolean
    ativa?: boolean
}

/** Lista resolvida: o agente, o escopo conferido e o canal do Engramind. */
export interface ResolvedList {
    agent: AiAgentId
    centralId: string | null
    clientId: string | null
    channel: string
    /** Nome da central/cliente (nome do canal criado sob demanda). */
    scopeName: string | null
}

const scopeOf = (scope: string | MemoryListScope | null | undefined): MemoryListScope => (typeof scope === "string" ? { centralId: scope } : (scope ?? {}))

export async function resolveList(agentId: string, rawScope?: string | MemoryListScope | null): Promise<ResolvedList> {
    const agent = assertAgentId(agentId)
    const scope = scopeOf(rawScope)
    const def = AI_AGENTS[agent]
    const central = scope.centralId?.trim() || null
    const client = scope.clientId?.trim() || null
    if (def.scope !== "central" && central) throw new DomainError(400, `A lista "${def.title}" não é de uma central`, "CENTRAL_NOT_ALLOWED")
    if (def.scope !== "client" && client) throw new DomainError(400, `A lista "${def.title}" não é de um cliente`, "CLIENT_NOT_ALLOWED")
    if (def.scope === "central") {
        if (!central) throw new DomainError(400, `Informe a central da lista "${def.title}"`, "CENTRAL_REQUIRED")
        if (!Types.ObjectId.isValid(central)) throw new DomainError(404, "Central não encontrada", "CENTRAL_NOT_FOUND")
        await dbConnect()
        const { AgenticCentral } = await import("@/lib/db/models/Agentic")
        const doc = await AgenticCentral.findById(central).select({ projectName: 1 }).lean()
        if (!doc) throw new DomainError(404, "Central não encontrada", "CENTRAL_NOT_FOUND")
        return { agent, centralId: central, clientId: null, channel: memoryChannelOf(agent, { centralId: central })!, scopeName: doc.projectName ?? null }
    }
    if (def.scope === "client") {
        if (!client) throw new DomainError(400, `Informe o cliente da lista "${def.title}"`, "CLIENT_REQUIRED")
        if (!Types.ObjectId.isValid(client)) throw new DomainError(404, "Cliente não encontrado", "CLIENT_NOT_FOUND")
        await dbConnect()
        const { OrcamentoClient } = await import("@/lib/db/models/Orcamento")
        const doc = await OrcamentoClient.findById(client).select({ name: 1 }).lean<{ name?: string } | null>()
        if (!doc) throw new DomainError(404, "Cliente não encontrado", "CLIENT_NOT_FOUND")
        return { agent, centralId: null, clientId: client, channel: memoryChannelOf(agent, { clientId: client })!, scopeName: doc.name ?? null }
    }
    return { agent, centralId: null, clientId: null, channel: def.channel, scopeName: null }
}

const isConsumer = (value: string): value is MemoryConsumer => (MEMORY_CONSUMERS as readonly string[]).includes(value)

/** Autor exibido: o dono, o Mentor (rótulo), o agente ou o autor do Engramind (memória criada fora do Opex). */
function authorOf(memory: EngramindMemory): string | null {
    const source = memory.origin?.source
    if (source && OWNER_SOURCES.has(source)) return getLocalUser().name
    if (source && isConsumer(source)) return MEMORY_CONSUMER_DEFS[source].label
    if (source && memory.origin?.label) return memory.origin.label
    return memory.author?.agent ?? memory.author?.app ?? null
}

export function isOwnerMemory(memory: Pick<EngramindMemory, "origin">): boolean {
    return Boolean(memory.origin?.source && OWNER_SOURCES.has(memory.origin.source))
}

export function toMemoryDto(memory: EngramindMemory, list: Pick<ResolvedList, "centralId" | "clientId">): MemoryDto {
    const pending = memory.title_state === "pending" || !memory.title
    const owner = isOwnerMemory(memory)
    return {
        id: memory.id,
        ...(list.centralId ? { centralId: list.centralId } : {}),
        ...(list.clientId ? { clientId: list.clientId } : {}),
        texto: memory.text,
        resumo: pending ? firstSentence(memory.text) : (memory.title ?? firstSentence(memory.text)),
        resumoPendente: memory.title_state === "pending",
        categoria: memory.category,
        fixada: memory.status === "permanent",
        ativa: memory.status !== "archived",
        versao: memory.version,
        autor: authorOf(memory),
        doDono: owner,
        origin: !owner && memory.origin?.source ? { source: memory.origin.source, label: memory.origin.label ?? memory.origin.source } : null,
        criadaEm: memory.created_at,
        atualizadaEm: memory.updated_at,
    }
}

export { sortMemories } from "../memory-list"

async function publish(list: Pick<ResolvedList, "agent" | "centralId" | "clientId">) {
    await publishToChannels([integrationChannel("ai")], AI_MEMORIES_UPDATED_EVENT, { agentId: list.agent, ...(list.centralId ? { centralId: list.centralId } : {}), ...(list.clientId ? { clientId: list.clientId } : {}) }).catch(() => undefined)
}

/** Memórias brutas de um canal (todas as páginas, inclusive as arquivadas). Canal inexistente → vazio. */
export async function listChannelMemories(channel: string): Promise<EngramindMemory[]> {
    const rows: EngramindMemory[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
        const result: { memories: EngramindMemory[]; next_cursor?: string | null } | null = await engramindCall("GET", {
            path: "/v1/memories",
            query: { channels: channel, status: "active,permanent,archived", limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
        })
        rows.push(...(result?.memories ?? []).filter((memory) => memory.channel === channel))
        cursor = result?.next_cursor ?? null
        if (!cursor) break
    }
    return rows
}

export async function listAgentMemories(agentId: string, scope?: string | MemoryListScope | null): Promise<MemoryDto[]> {
    const list = await resolveList(agentId, scope)
    return sortMemories((await listChannelMemories(list.channel)).map((memory) => toMemoryDto(memory, list)))
}

async function findMemory(list: ResolvedList, id: string): Promise<EngramindMemory> {
    if (!/^m_[A-Za-z0-9]+$/.test(id)) throw new DomainError(404, "Memória não encontrada", "NOT_FOUND")
    let memory: EngramindMemory
    try {
        memory = await engramindCall<EngramindMemory>("GET", { path: `/v1/memories/${encodeURIComponent(id)}` })
    } catch (error) {
        if (engramindCodeOf(error) === "MEMORY_NOT_FOUND") throw new DomainError(404, "Memória não encontrada", "NOT_FOUND")
        throw error
    }
    // Memória de outro canal (outra lista, outra central ou outro cliente) não existe para esta lista.
    if (memory.channel !== list.channel) throw new DomainError(404, "Memória não encontrada", "NOT_FOUND")
    return memory
}

export async function getAgentMemory(agentId: string, id: string, scope?: string | MemoryListScope | null): Promise<MemoryDto> {
    const list = await resolveList(agentId, scope)
    return toMemoryDto(await findMemory(list, id), list)
}

async function parseText(texto: string, channel: string): Promise<string> {
    const parsed = memoryTextSchema(await memoryLimitsFor(channel)).safeParse(texto)
    if (!parsed.success) throw new DomainError(400, parsed.error.issues[0]?.message ?? "Memória inválida", "VALIDATION_ERROR")
    return parsed.data
}

/** Categoria da lista `categories.list` (sem ela, a primeira). Fora da lista → 400 com as válidas. */
async function resolveCategory(categoria: string | null | undefined): Promise<string | undefined> {
    const { categories } = await memorySettings()
    if (!categoria) return categories[0]?.key
    if (categories.length && !categories.some((item) => item.key === categoria)) {
        throw new DomainError(400, `Categoria "${categoria}" fora da lista do Engramind. Escolha uma destas: ${categories.map((item) => item.key).join(", ")}`, "CATEGORY_NOT_FOUND", { valid: categories.map((item) => item.key) })
    }
    return categoria
}

async function targetFor(agent: MemoryAgentActor | undefined): Promise<{ target?: EngramindTarget }> {
    if (!agent) return {}
    const { agentTarget } = await import("@/features/engramind/server/memory-network")
    const target = await agentTarget(agent.consumer).catch(() => null)
    return target ? { target } : {}
}

function originOf(options: Pick<AgentMemoryWriteOptions, "origin" | "agent">): AgentMemoryOrigin {
    if (options.agent) return { source: options.agent.consumer, label: options.agent.label }
    return options.origin ?? OWNER_MEMORY_ORIGIN
}

const scopeAudit = (list: ResolvedList) => ({ agente: list.agent, ...(list.centralId ? { central: list.centralId } : {}), ...(list.clientId ? { cliente: list.clientId } : {}) })
const actorAudit = (options: Pick<AgentMemoryWriteOptions, "agent">) => (options.agent ? { ator: `agente:${options.agent.consumer}` } : {})

async function ensureListChannel(list: ResolvedList): Promise<void> {
    const { ensureMemoryChannel } = await import("@/features/engramind/server/memory-network")
    await ensureMemoryChannel(list.channel, memoryChannelName(list.agent, list.scopeName ?? undefined), AI_AGENTS[list.agent].description)
}

export async function createAgentMemory(agentId: string, texto: string, actorId: string, options: AgentMemoryWriteOptions = {}): Promise<MemoryMutationResult> {
    const list = await resolveList(agentId, options)
    const text = await parseText(texto, list.channel)
    const category = await resolveCategory(options.categoria)
    const origin = originOf(options)
    const body = { channel: list.channel, text, ...(category ? { category } : {}), origin, status: options.fixada ? "permanent" : "active" }
    const call = async () => engramindCall<MemoryWrite>("POST", { path: "/v1/memories", body }, await targetFor(options.agent))
    let result: MemoryWrite
    try {
        result = await call()
    } catch (error) {
        // O canal ainda não existe (central/cliente novo ou rede ainda não conferida): cria e repete.
        if (engramindCodeOf(error) !== "CHANNEL_NOT_FOUND" && engramindCodeOf(error) !== "CHANNEL_NOT_SUBSCRIBED") throw error
        await ensureListChannel(list)
        result = await call()
    }
    const memory = toMemoryDto(result.memory, list)
    const similares = (result.similar ?? []).filter((item) => item.id !== memory.id).map((item) => ({ id: item.id, resumo: item.title ?? "", similaridade: item.score ?? 0 }))
    if (result.duplicate) {
        log.info({ agentId: list.agent, memoryId: memory.id }, "[ai] memória igual já existia na lista: nada foi gravado")
        return { memoria: memory, duplicada: true, similares }
    }
    await recordAudit({
        userId: actorId,
        entidade: AI_MEMORY_AUDIT_ENTITY,
        entidadeId: memory.id,
        acao: AcaoAuditoria.CRIAR,
        depois: { ...scopeAudit(list), texto: memory.texto, categoria: memory.categoria, ...(options.fixada ? { fixada: true } : {}), origem: origin.label, ...actorAudit(options), ...options.auditContext },
    })
    log.info({ agentId: list.agent, memoryId: memory.id, origem: origin.source }, `[ai] Memória (${AI_AGENTS[list.agent].title}) criada`)
    await publish(list)
    return { memoria: memory, similares }
}

function ownerProtected(memory: EngramindMemory, action: string): DomainError {
    return new DomainError(403, `Memória escrita pelo dono: só ele pode ${action}. Edite o texto ou funda o conteúdo nela.`, "OWNER_MEMORY_PROTECTED", { memoryId: memory.id })
}

async function writeCall<T>(method: "POST" | "PATCH", path: string, body: unknown, agent: MemoryAgentActor | undefined): Promise<T> {
    try {
        return await engramindCall<T>(method, { path, body }, await targetFor(agent))
    } catch (error) {
        const code = engramindCodeOf(error)
        if (code === "MEMORY_VERSION_CONFLICT") throw new DomainError(409, "Esta memória mudou enquanto você editava. Confira a versão atual.", "MEMORY_VERSION_CONFLICT")
        if (code === "MEMORY_DUPLICATE") throw new DomainError(409, "Já existe uma memória igual nesta lista.", "MEMORY_DUPLICATE")
        throw error
    }
}

export async function updateAgentMemory(agentId: string, id: string, change: string | MemoryPatch, actorId: string, options: AgentMemoryWriteOptions = {}): Promise<MemoryMutationResult> {
    const patch: MemoryPatch = typeof change === "string" ? { texto: change } : change
    const list = await resolveList(agentId, options)
    const current = await findMemory(list, id)
    if (options.agent && patch.ativa === false && isOwnerMemory(current)) throw ownerProtected(current, "inativá-la")
    const path = `/v1/memories/${encodeURIComponent(id)}`
    const actions: string[] = []
    const edit: Record<string, unknown> = {}
    if (patch.texto !== undefined) {
        const text = await parseText(patch.texto, list.channel)
        if (text !== current.text) edit.text = text
    }
    if (patch.categoria !== undefined && patch.categoria !== current.category) edit.category = await resolveCategory(patch.categoria)
    let similares: MemoryMutationResult["similares"]
    if (Object.keys(edit).length) {
        const written = await writeCall<MemoryWrite>("PATCH", path, { ...edit, ...(patch.versao !== undefined ? { expected_version: patch.versao } : {}) }, options.agent)
        similares = (written.similar ?? []).filter((item) => item.id !== id).map((item) => ({ id: item.id, resumo: item.title ?? "", similaridade: item.score ?? 0 }))
        actions.push("editar")
    }
    let status = current.status
    if (patch.ativa === false && status !== "archived") {
        // Inativar uma fixada também a desafixa (reativada, volta como ativa).
        if (status === "permanent") await writeCall("POST", `${path}/unpin`, {}, options.agent)
        await writeCall("POST", `${path}/archive`, {}, options.agent)
        actions.push("inativar")
        status = "archived"
    } else if (patch.ativa !== false) {
        if ((patch.ativa === true || patch.fixada === true) && status === "archived") {
            await writeCall("POST", `${path}/restore`, {}, options.agent)
            actions.push("ativar")
            status = "active"
        }
        if (patch.fixada === true && status !== "permanent") {
            await writeCall("POST", `${path}/pin`, {}, options.agent)
            actions.push("fixar")
        }
        if (patch.fixada === false && status === "permanent") {
            await writeCall("POST", `${path}/unpin`, {}, options.agent)
            actions.push("desafixar")
        }
    }
    const updated = actions.length ? await findMemory(list, id) : current
    if (actions.length) {
        await recordAudit({
            userId: actorId,
            entidade: AI_MEMORY_AUDIT_ENTITY,
            entidadeId: id,
            acao: AcaoAuditoria.ATUALIZAR,
            antes: { ...scopeAudit(list), texto: current.text, categoria: current.category, status: current.status },
            depois: { ...scopeAudit(list), acoes: actions, texto: updated.text, categoria: updated.category, status: updated.status, ...(options.origin || options.agent ? { origem: originOf(options).label } : {}), ...actorAudit(options), ...options.auditContext },
        })
        log.info({ agentId: list.agent, memoryId: id, acoes: actions }, `[ai] Memória (${AI_AGENTS[list.agent].title}) atualizada`)
        await publish(list)
    }
    return { memoria: toMemoryDto(updated, list), ...(similares?.length ? { similares } : {}) }
}

export async function deleteAgentMemory(agentId: string, id: string, actorId: string, scope?: string | MemoryListScope | null, options: Pick<AgentMemoryWriteOptions, "agent" | "auditContext"> = {}): Promise<MemoryDto> {
    const list = await resolveList(agentId, scope)
    const current = await findMemory(list, id)
    if (options.agent && isOwnerMemory(current)) throw ownerProtected(current, "excluí-la")
    try {
        await engramindCall("DELETE", { path: `/v1/memories/${encodeURIComponent(id)}` }, await targetFor(options.agent))
    } catch (error) {
        if (engramindCodeOf(error) !== "MEMORY_NOT_FOUND") throw error
    }
    await recordAudit({
        userId: actorId,
        entidade: AI_MEMORY_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.EXCLUIR,
        antes: { ...scopeAudit(list), texto: current.text, categoria: current.category, ...(current.origin?.label ? { origem: current.origin.label } : {}) },
        ...(options.agent || options.auditContext ? { depois: { ...actorAudit(options), ...options.auditContext } } : {}),
    })
    log.info({ agentId: list.agent, memoryId: id }, `[ai] Memória (${AI_AGENTS[list.agent].title}) excluída`)
    await publish(list)
    return toMemoryDto(current, list)
}

/** Central criada: cria o canal de memórias dela (melhor esforço; sem ele, nasce na primeira gravação). Nunca lança. */
export async function ensureCentralMemoryChannel(centralId: string, projectName: string): Promise<void> {
    const channel = memoryChannelOf("developer-central", { centralId })
    if (!channel) return
    try {
        const { ensureMemoryChannel } = await import("@/features/engramind/server/memory-network")
        await ensureMemoryChannel(channel, memoryChannelName("developer-central", projectName), AI_AGENTS["developer-central"].description)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), centralId }, "[ai] canal de memórias da central não criado agora: nasce na primeira gravação")
    }
}

/** Central excluída: arquiva o canal dela no Engramind (recuperável). Nunca lança; devolve se arquivou. */
export async function archiveCentralMemories(centralId: string): Promise<boolean> {
    const channel = memoryChannelOf("developer-central", { centralId })
    if (!channel) return false
    try {
        const { archiveMemoryChannel } = await import("@/features/engramind/server/memory-network")
        const archived = await archiveMemoryChannel(channel)
        if (archived) await publish({ agent: "developer-central", centralId, clientId: null })
        return archived
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), centralId }, "[ai] não foi possível arquivar o canal de memórias da central")
        return false
    }
}

/** Cliente excluído: arquiva os canais de memórias dele (Agente Opex e Maddox). Nunca lança. */
export async function archiveClientMemories(clientId: string): Promise<void> {
    const { archiveMemoryChannel } = await import("@/features/engramind/server/memory-network")
    for (const agent of ["opex-client-specific", "maddox-client-specific"] as const) {
        const channel = memoryChannelOf(agent, { clientId })
        if (!channel) continue
        try {
            if (await archiveMemoryChannel(channel)) await publish({ agent, centralId: null, clientId })
        } catch (error) {
            log.warn({ err: error instanceof Error ? error.message : String(error), clientId, agent }, "[ai] não foi possível arquivar o canal de memórias do cliente")
        }
    }
}

export { memoriesSection } from "../memories-prompt"
