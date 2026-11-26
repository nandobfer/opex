import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { clientActorFor } from "@/features/auth/server/context"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { OpexMessage, OpexSession, OpexWatch, type IOpexWatch } from "@/lib/db/models/Opex"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { User } from "@/lib/db/models/User"
import { isPreviewInstance } from "@/lib/instance"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { opexChannel } from "@/lib/pusher/channel-names"
import { publishAppEvent, publishToChannels } from "@/lib/pusher/channels"
import {
    OPEX_CLIENT_WATCH_TARGET_KINDS,
    OPEX_WATCH_ACTIVE_STATUSES,
    OPEX_WATCH_AUDIT_ENTITY,
    OPEX_WATCH_DEFAULT_HOURS,
    OPEX_WATCH_LIST_LIMIT,
    OPEX_WATCH_MAX_PER_OWNER,
    OPEX_WATCH_MAX_PER_SESSION,
    OPEX_WATCH_RETENTION_MS,
    OPEX_WATCH_TARGET_LABELS,
    OPEX_WATCH_UPDATED_EVENT,
    currentSatisfies,
    matchesWatch,
    statusLabel,
    wakeDisplay,
    wakeModelText,
    watchConditionText,
    watchEventShort,
    watchEventSummary,
    watchPillText,
    watchTargetText,
    type OpexWakeWatch,
    type OpexWatchCondition,
    type OpexWatchDto,
    type OpexWatchEvent,
    type OpexWatchInput,
    type OpexWatchListQuery,
    type OpexWatchStatus,
    type OpexWatchTarget,
    type OpexWatchTargetKind,
    type OpexWatchTargetState,
} from "../watches"
import type { OpexJobOriginDto } from "../jobs"
import { assertClientOpexEnabled, enabledClientToolNamesFor } from "./client-config"
import { hasQueuedWatch, isTurnActive } from "./hub"
import { OWNER_SCOPE, clientOpexScope, sessionFilterOf, type OpexServerScope } from "./scope"
import { opexDb } from "./sessions"

/**
 * Observação de eventos do Agente Opex (OPE-194). Assinatura pela ferramenta `watch_event`; o disparo
 * vem dos pontos de transição (`watch-events.ts`) ou do tick (vencidas). A reserva é atômica no banco
 * (`watching → triggered → delivering → woken`): um evento acorda uma vez, mesmo com a prévia do Opex
 * gravando no mesmo banco. Só a instância principal entrega (turno, hub e stream vivem no processo).
 * Ver `aicontext/modules/opex-agent.md`, "Observação de eventos".
 */

const log = loggerFor({ module: "opex-agent", feature: "watches" })

/** `delivering` sem turno vivo nem fila depois disto foi perdido (o servidor reiniciou). */
const LOST_AFTER_MS = 2 * 60_000
/** Sessões entregues por tick (o resto fica para o minuto seguinte). */
const DUE_SESSIONS = 20
/** Observações vencidas processadas por tick. */
const EXPIRE_BATCH = 50

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
const formatDate = (date: Date) => dateFormatter.format(date)
const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : null)

type WatchDoc = IOpexWatch

interface WatchOwner {
    clientId: string | null
    userId: string
}

const ownerOfScope = (scope: OpexServerScope): WatchOwner => (scope.kind === "client" ? { clientId: String(scope.actor.client._id), userId: scope.actor.userId } : { clientId: null, userId: getLocalUser().id })

/** Observações visíveis no escopo: o dono vê todas; o usuário do portal, só as próprias. */
const watchFilterOf = (scope: OpexServerScope): Record<string, unknown> => (scope.kind === "owner" ? {} : { clientId: String(scope.actor.client._id), userId: scope.actor.userId })

const purgeAt = (now: Date) => new Date(now.getTime() + OPEX_WATCH_RETENTION_MS)

type Names = { clients: Map<string, string>; users: Map<string, string> }

async function namesFor(docs: readonly WatchDoc[]): Promise<Names> {
    const clientIds = [...new Set(docs.map((doc) => doc.clientId).filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id!)))]
    const userIds = [...new Set(docs.filter((doc) => doc.clientId).map((doc) => doc.userId).filter((id) => Types.ObjectId.isValid(id)))]
    const [clients, users] = await Promise.all([
        clientIds.length ? OrcamentoClient.find({ _id: { $in: clientIds } }).select({ name: 1 }).lean<{ _id: Types.ObjectId; name: string }[]>() : [],
        userIds.length ? User.find({ _id: { $in: userIds } }).select({ username: 1 }).lean<{ _id: Types.ObjectId; username: string }[]>() : [],
    ])
    return { clients: new Map(clients.map((item) => [String(item._id), item.name])), users: new Map(users.map((item) => [String(item._id), item.username])) }
}

function originOf(doc: WatchDoc, names: Names | null): OpexJobOriginDto {
    if (!doc.clientId) return { kind: "owner" }
    const owner = getLocalUser()
    const userName = doc.userId === owner.id ? `${owner.name} (pré-visualização)` : (names?.users.get(doc.userId) ?? "Usuário removido")
    return { kind: "client", clientId: doc.clientId, clientName: names?.clients.get(doc.clientId) ?? "Cliente excluído", userId: doc.userId, userName }
}

export function toWatchDto(doc: WatchDoc, names: Names | null = null): OpexWatchDto {
    const target: OpexWatchTarget = { kind: doc.target.kind, id: doc.target.id, label: doc.target.label }
    const condition: OpexWatchCondition = { event: doc.condition.event, values: doc.condition.values ?? [], labels: doc.condition.labels ?? [] }
    return {
        id: doc._id.toString(),
        sessionId: doc.sessionId.toString(),
        target,
        condition,
        conditionText: watchConditionText(target.kind, condition),
        pillText: watchPillText(target, condition),
        note: doc.note,
        status: doc.status,
        outcome: doc.outcome ?? null,
        event: doc.event ? { summary: doc.event.summary, at: new Date(doc.event.at).toISOString() } : null,
        expiresAt: new Date(doc.expiresAt).toISOString(),
        triggeredAt: iso(doc.triggeredAt),
        wokenAt: iso(doc.wokenAt),
        error: doc.error ?? null,
        createdAt: new Date(doc.createdAt).toISOString(),
        origin: originOf(doc, names),
    }
}

async function toWatchDtos(docs: WatchDoc[]): Promise<OpexWatchDto[]> {
    const names = await namesFor(docs)
    return docs.map((doc) => toWatchDto(doc, names))
}

/** Telas do dono sempre (`private-app`); a observação do portal também no canal do usuário. */
async function publishWatch(doc: Pick<WatchDoc, "_id" | "status" | "sessionId" | "clientId" | "userId">): Promise<void> {
    const payload = { id: doc._id.toString(), status: doc.status, sessionId: doc.sessionId.toString() }
    try {
        await publishAppEvent(OPEX_WATCH_UPDATED_EVENT, payload)
        if (doc.clientId && doc.userId) await publishToChannels([opexChannel(doc.clientId, doc.userId)], OPEX_WATCH_UPDATED_EVENT, payload)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : error, watchId: payload.id }, "[opex] falha ao publicar a observação")
    }
}

function auditActor(doc: Pick<WatchDoc, "clientId" | "userId">): string {
    return doc.clientId ? doc.userId : getLocalUser().id
}

// ---------------------------------------------------------------------------------------------
// Alvo: resolução no escopo e estado atual (lido uma vez na assinatura)
// ---------------------------------------------------------------------------------------------

interface ResolvedTarget {
    target: OpexWatchTarget
    meta: Record<string, unknown> | null
    state: OpexWatchTargetState
    /** Rótulos dos valores da condição (nomes de colunas, etapas ou status). */
    labels: string[]
    /** Estado atual em texto (devolvido ao modelo). */
    current: string
}

const notFound = (kind: OpexWatchTargetKind, ref: string): never => {
    throw new DomainError(404, `${OPEX_WATCH_TARGET_LABELS[kind]} "${ref}" não encontrado(a) no seu escopo`, "OPEX_WATCH_TARGET_NOT_FOUND")
}

async function boardColumns(): Promise<Map<string, string>> {
    const { getBoard } = await import("@/features/tasks/server/columns")
    return new Map((await getBoard()).columns.map((column) => [column.key, column.name]))
}

async function resolveTaskTarget(ref: string, values: string[], scope: OpexServerScope): Promise<ResolvedTarget> {
    let taskId: string
    if (scope.kind === "client") {
        const { listClientTasks } = await import("@/features/orcamentos/server/portal")
        const list = await listClientTasks(scope.actor.client, true)
        const found = list.tasks.find((item) => item.id === ref || item.code.toLowerCase() === ref.toLowerCase())
        if (!found) return notFound("task", ref)
        taskId = found.id
    } else {
        const { resolveTask } = await import("./tools/helpers")
        taskId = (await resolveTask(ref)).id
    }
    const [{ DevTask }, { Project }] = await Promise.all([import("@/lib/db/models/DevTask"), import("@/lib/db/models/Project")])
    const task = Types.ObjectId.isValid(taskId) ? await DevTask.findById(taskId).select({ code: 1, title: 1, columnId: 1, projectId: 1, archived: 1 }).lean<{ _id: Types.ObjectId; code: string; title: string; columnId: string; projectId: string; archived?: boolean }>() : null
    if (!task) return notFound("task", ref)
    const project = await Project.findById(task.projectId).select({ closedColumnKey: 1 }).lean<{ closedColumnKey: string | null }>()
    const columns = await boardColumns()
    const unknown = values.filter((key) => !columns.has(key))
    if (unknown.length) throw new DomainError(400, `Colunas inexistentes: ${unknown.join(", ")} (use as chaves de get_task_options ou do quadro)`, "OPEX_WATCH_INVALID_VALUES")
    const done = Boolean(project?.closedColumnKey && task.columnId === project.closedColumnKey)
    return {
        target: { kind: "task", id: String(task._id), label: task.code },
        meta: { projectId: task.projectId, closedColumnKey: project?.closedColumnKey ?? null },
        state: { columnKey: task.columnId, done, archived: Boolean(task.archived) },
        labels: values.map((key) => columns.get(key) ?? key),
        current: `Coluna atual: "${columns.get(task.columnId) ?? task.columnId}"${done ? " (coluna de conclusão)" : ""}${task.archived ? "; arquivada" : ""}.`,
    }
}

async function resolveWorkbenchTarget(ref: string, values: string[]): Promise<ResolvedTarget> {
    const { AgenticWorkbench } = await import("@/lib/db/models/Agentic")
    type Row = { _id: Types.ObjectId; taskCode: string; stage: string; runState: string }
    const select = { taskCode: 1, stage: 1, runState: 1 }
    let doc: Row | null = Types.ObjectId.isValid(ref) ? await AgenticWorkbench.findById(ref).select(select).lean<Row>() : null
    if (!doc) {
        // Pelo código da tarefa (uma mesa por tarefa).
        const { resolveTask } = await import("./tools/helpers")
        const taskId = await resolveTask(ref).then((found) => found.id).catch(() => null)
        doc = taskId ? await AgenticWorkbench.findOne({ taskId }).select(select).lean<Row>() : null
    }
    if (!doc) return notFound("workbench", ref)
    return {
        target: { kind: "workbench", id: String(doc._id), label: doc.taskCode },
        meta: null,
        state: { stage: doc.stage, runState: doc.runState },
        labels: values.map((stage) => statusLabel("workbench", stage)),
        current: `Etapa atual: "${statusLabel("workbench", doc.stage)}" (execução: ${doc.runState}).`,
    }
}

async function resolveRoutineRunTarget(ref: string, values: string[]): Promise<ResolvedTarget> {
    const { RoutineAgent, RoutineRun } = await import("@/lib/db/models/RoutineAgent")
    const run = Types.ObjectId.isValid(ref) ? await RoutineRun.findById(ref).select({ agentId: 1, status: 1 }).lean<{ _id: Types.ObjectId; agentId: Types.ObjectId; status: string }>() : null
    if (!run) return notFound("routine_run", ref)
    const agent = await RoutineAgent.findById(run.agentId).select({ name: 1 }).lean<{ name: string }>()
    return {
        target: { kind: "routine_run", id: String(run._id), label: agent?.name || "agente removido" },
        meta: { agentId: String(run.agentId) },
        state: { status: run.status },
        labels: values.map((status) => statusLabel("routine_run", status)),
        current: `Status atual: "${statusLabel("routine_run", run.status)}".`,
    }
}

async function resolveJobTarget(ref: string, values: string[], scope: OpexServerScope): Promise<ResolvedTarget> {
    const { OpexJob } = await import("@/lib/db/models/Opex")
    const job = Types.ObjectId.isValid(ref) ? await OpexJob.findOne({ _id: ref, ...watchFilterOf(scope) }).select({ title: 1, status: 1 }).lean<{ _id: Types.ObjectId; title: string; status: string }>() : null
    if (!job) return notFound("job", ref)
    return {
        target: { kind: "job", id: String(job._id), label: job.title },
        meta: null,
        state: { status: job.status },
        labels: values.map((status) => statusLabel("job", status)),
        current: `Status atual: "${statusLabel("job", job.status)}".`,
    }
}

async function resolveEnvironmentTarget(ref: string, values: string[], scope: OpexServerScope): Promise<ResolvedTarget> {
    const env =
        scope.kind === "client"
            ? await (await import("@/features/environments/server/portal")).resolvePortalEnvironment(scope.actor.client, ref)
            : await (await import("@/features/environments/server/service")).resolveEnvironmentRef(ref).catch(() => null)
    if (!env) return notFound("environment", ref)
    return {
        target: { kind: "environment", id: String(env._id), label: env.name || env.slug },
        meta: { slug: env.slug },
        state: {},
        labels: values.map((status) => statusLabel("environment", status)),
        current: "A observação vale para o próximo deploy (ou mover) que terminar.",
    }
}

export async function resolveWatchTarget(kind: OpexWatchTargetKind, ref: string, values: string[], scope: OpexServerScope): Promise<ResolvedTarget> {
    if (scope.kind === "client" && !(OPEX_CLIENT_WATCH_TARGET_KINDS as readonly string[]).includes(kind))
        throw new DomainError(400, `No portal só dá para observar ${OPEX_CLIENT_WATCH_TARGET_KINDS.map((item) => OPEX_WATCH_TARGET_LABELS[item].toLowerCase()).join(", ")}`, "OPEX_WATCH_TARGET_UNSUPPORTED")
    switch (kind) {
        case "task":
            return resolveTaskTarget(ref, values, scope)
        case "workbench":
            return resolveWorkbenchTarget(ref, values)
        case "routine_run":
            return resolveRoutineRunTarget(ref, values)
        case "job":
            return resolveJobTarget(ref, values, scope)
        case "environment":
            return resolveEnvironmentTarget(ref, values, scope)
    }
}

// ---------------------------------------------------------------------------------------------
// Assinar, listar e cancelar
// ---------------------------------------------------------------------------------------------

export interface OpexWatchOrigin {
    actorId: string
    /** Sessão do Agente Opex que vai acordar (a do turno da ferramenta). */
    sessionId: string | null | undefined
}

export type CreateWatchResult =
    | { alreadySatisfied: true; target: OpexWatchTarget; conditionText: string; current: string }
    | { alreadySatisfied: false; reused: boolean; watch: OpexWatchDto; current: string }

/**
 * Assina um evento. Alvo fora do escopo ou inexistente dá 404 sem gravar; condição já satisfeita
 * devolve `alreadySatisfied` sem criar nada; assinatura ativa idêntica na sessão é reaproveitada.
 */
export async function createOpexWatch(input: OpexWatchInput, origin: OpexWatchOrigin, scope: OpexServerScope = OWNER_SCOPE, now = new Date()): Promise<CreateWatchResult> {
    await opexDb()
    const sessionId = origin.sessionId
    if (!sessionId || !Types.ObjectId.isValid(sessionId)) throw new DomainError(400, "A observação precisa de uma conversa do Agente Opex para acordar", "OPEX_WATCH_SESSION_REQUIRED")
    const session = await OpexSession.exists({ _id: sessionId, ...sessionFilterOf({ ...scope, agent: "opex" }) })
    if (!session) throw new DomainError(400, "A conversa do Agente Opex não foi encontrada", "OPEX_WATCH_SESSION_REQUIRED")

    const values = [...new Set(input.values ?? [])]
    const resolved = await resolveWatchTarget(input.target.kind, input.target.ref.trim(), values, scope)
    const condition: OpexWatchCondition = { event: input.event, values, labels: resolved.labels }
    const conditionText = watchConditionText(resolved.target.kind, condition)
    if (currentSatisfies(resolved.target.kind, condition, resolved.state)) return { alreadySatisfied: true, target: resolved.target, conditionText, current: resolved.current }

    const owner = ownerOfScope(scope)
    const sessionObjectId = new Types.ObjectId(sessionId)
    const active = { $in: [...OPEX_WATCH_ACTIVE_STATUSES] }
    const existing = await OpexWatch.findOne({ sessionId: sessionObjectId, status: "watching", "target.kind": resolved.target.kind, "target.id": resolved.target.id, "condition.event": condition.event, "condition.values": values }).lean<WatchDoc>()
    if (existing) {
        const updated = await OpexWatch.findOneAndUpdate({ _id: existing._id, status: "watching" }, { $set: { note: input.note } }, { new: true }).lean<WatchDoc>()
        const [dto] = await toWatchDtos([updated ?? existing])
        return { alreadySatisfied: false, reused: true, watch: dto!, current: resolved.current }
    }
    const [perSession, perOwner] = await Promise.all([
        OpexWatch.countDocuments({ sessionId: sessionObjectId, status: active }),
        OpexWatch.countDocuments({ clientId: owner.clientId, ...(owner.clientId ? { userId: owner.userId } : {}), status: active }),
    ])
    if (perSession >= OPEX_WATCH_MAX_PER_SESSION) throw new DomainError(409, `Esta conversa já tem ${OPEX_WATCH_MAX_PER_SESSION} observações ativas: cancele alguma antes (list_watches / cancel_watch)`, "OPEX_WATCH_LIMIT")
    if (perOwner >= OPEX_WATCH_MAX_PER_OWNER) throw new DomainError(409, `Limite de ${OPEX_WATCH_MAX_PER_OWNER} observações ativas atingido: cancele alguma antes`, "OPEX_WATCH_LIMIT")

    const expiresAt = new Date(now.getTime() + (input.expiresInHours ?? OPEX_WATCH_DEFAULT_HOURS) * 3_600_000)
    const doc = await OpexWatch.create({
        sessionId: sessionObjectId,
        clientId: owner.clientId,
        userId: owner.userId,
        createdBy: "agent",
        target: { ...resolved.target, meta: resolved.meta },
        condition,
        note: input.note,
        status: "watching",
        expiresAt,
    })
    const created = doc.toObject() as WatchDoc
    const id = created._id.toString()
    await recordAudit({
        userId: origin.actorId,
        entidade: OPEX_WATCH_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.CRIAR,
        depois: { alvo: watchTargetText(resolved.target), condicao: conditionText, expiraEm: expiresAt.toISOString(), sessao: sessionId, cliente: owner.clientId, usuario: owner.userId },
    })
    log.info({ watchId: id, target: resolved.target, event: condition.event, sessionId, clientId: owner.clientId }, "[opex] observação criada")
    await publishWatch(created)
    const [dto] = await toWatchDtos([created])
    return { alreadySatisfied: false, reused: false, watch: dto!, current: resolved.current }
}

function listQuery(query: Partial<OpexWatchListQuery>, scope: OpexServerScope): Record<string, unknown> {
    const where: Record<string, unknown> = { ...watchFilterOf(scope) }
    const filter = query.filter ?? "active"
    if (filter === "active") where.status = { $in: [...OPEX_WATCH_ACTIVE_STATUSES] }
    else if (filter === "finished") where.status = { $nin: [...OPEX_WATCH_ACTIVE_STATUSES] }
    if (query.sessionId && Types.ObjectId.isValid(query.sessionId)) where.sessionId = new Types.ObjectId(query.sessionId)
    if (scope.kind === "owner") {
        if (query.origin === "owner") where.clientId = null
        if (query.origin === "client") where.clientId = { $ne: null }
        if (query.clientId) where.clientId = query.clientId
        if (query.userId) where.userId = query.userId
    }
    return where
}

export async function listOpexWatches(query: Partial<OpexWatchListQuery> = {}, scope: OpexServerScope = OWNER_SCOPE): Promise<OpexWatchDto[]> {
    await opexDb()
    const docs = await OpexWatch.find(listQuery(query, scope)).sort({ createdAt: -1 }).limit(OPEX_WATCH_LIST_LIMIT).lean<WatchDoc[]>()
    return toWatchDtos(docs)
}

/** Observações de uma sessão no escopo (faixa "Observando…" do chat). */
export async function listSessionWatches(sessionId: string, scope: OpexServerScope = OWNER_SCOPE, filter: OpexWatchListQuery["filter"] = "active"): Promise<OpexWatchDto[]> {
    await opexDb()
    const session = Types.ObjectId.isValid(sessionId) ? await OpexSession.exists({ _id: sessionId, ...sessionFilterOf({ ...scope, agent: "opex" }) }) : null
    if (!session) throw new DomainError(404, "Sessão não encontrada", "OPEX_SESSION_NOT_FOUND")
    return listOpexWatches({ filter, sessionId }, scope)
}

async function findWatch(id: string, scope: OpexServerScope): Promise<WatchDoc> {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Observação não encontrada", "OPEX_WATCH_NOT_FOUND")
    await opexDb()
    const doc = await OpexWatch.findOne({ _id: id, ...watchFilterOf(scope) }).lean<WatchDoc>()
    if (!doc) throw new DomainError(404, "Observação não encontrada", "OPEX_WATCH_NOT_FOUND")
    return doc
}

export async function getOpexWatch(id: string, scope: OpexServerScope = OWNER_SCOPE): Promise<OpexWatchDto> {
    const [dto] = await toWatchDtos([await findWatch(id, scope)])
    return dto!
}

/** Cancela uma observação ainda observando (409 depois de disparar). O dono cancela também as do portal. */
export async function cancelOpexWatch(id: string, actorId: string, scope: OpexServerScope = OWNER_SCOPE, now = new Date()): Promise<OpexWatchDto> {
    const before = await findWatch(id, scope)
    const updated = await OpexWatch.findOneAndUpdate({ _id: before._id, status: "watching" }, { $set: { status: "canceled", canceledBy: actorId, purgeAt: purgeAt(now) } }, { new: true }).lean<WatchDoc>()
    if (!updated) throw new DomainError(409, "Só observações ativas (ainda observando) podem ser canceladas", "OPEX_WATCH_NOT_ACTIVE")
    await recordAudit({
        userId: actorId,
        entidade: OPEX_WATCH_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ABORTAR,
        antes: { alvo: watchTargetText(before.target), condicao: watchConditionText(before.target.kind, before.condition), cliente: before.clientId ?? null },
    })
    await publishWatch(updated)
    const [dto] = await toWatchDtos([updated])
    return dto!
}

// ---------------------------------------------------------------------------------------------
// Disparo (pontos de transição e tick) e entrega
// ---------------------------------------------------------------------------------------------

/**
 * Ponto de transição: um `find` indexado pelas observando do alvo; só com alguma, monta o fato
 * (`build`) e dispara. Nunca lança (falha vira log): a mutação de quem chamou não pode cair por isso.
 */
export async function notifyWatchTarget(kind: OpexWatchTargetKind, id: string, build: () => Promise<OpexWatchEvent | null> | OpexWatchEvent | null): Promise<void> {
    try {
        await opexDb()
        const watching = await OpexWatch.find({ status: "watching", "target.kind": kind, "target.id": id }).lean<WatchDoc[]>()
        if (!watching.length) return
        const event = await build()
        if (event) await notifyWatchEvent(event, watching)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : error, kind, id }, "[opex] falha ao disparar as observações do alvo")
    }
}

/**
 * Reserva (atômica, `watching → triggered`) as observações que casam com o fato e, fora da prévia,
 * entrega por sessão. Um fato repetido ou concorrente não reserva de novo.
 */
export async function notifyWatchEvent(event: OpexWatchEvent, candidates?: WatchDoc[], now = new Date()): Promise<string[]> {
    const docs = candidates ?? (await OpexWatch.find({ status: "watching", "target.kind": event.kind, "target.id": event.id }).lean<WatchDoc[]>())
    const sessions = new Set<string>()
    const claimedIds: string[] = []
    const snapshot = { summary: watchEventSummary(event), short: watchEventShort(event), at: now }
    for (const doc of docs) {
        if (!matchesWatch(doc.target, doc.condition, event)) continue
        const claimed = await OpexWatch.findOneAndUpdate(
            { _id: doc._id, status: "watching" },
            { $set: { status: "triggered", outcome: event.deleted ? "target_deleted" : "event", event: snapshot, triggeredAt: now } },
            { new: true },
        ).lean<WatchDoc>()
        if (!claimed) continue
        claimedIds.push(claimed._id.toString())
        sessions.add(claimed.sessionId.toString())
        log.info({ watchId: claimed._id.toString(), target: claimed.target, outcome: claimed.outcome }, "[opex] observação disparada")
        await publishWatch(claimed)
    }
    // A prévia do Opex (mesmo banco) só reserva: o turno precisa rodar na instância principal (hub e stream).
    if (!isPreviewInstance()) for (const sessionId of sessions) await deliverSessionWatches(sessionId, now)
    return claimedIds
}

class WatchFailure extends Error {}

/** Escopo do portal revalidado, com o agente e a observação de eventos ainda ligados para o cliente. */
async function clientScopeForDelivery(clientId: string, userId: string): Promise<OpexServerScope> {
    try {
        const actor = await clientActorFor(userId, clientId)
        await assertClientOpexEnabled(actor)
        const { names } = await enabledClientToolNamesFor(actor)
        if (!names.includes("watch_event")) throw new WatchFailure("A observação de eventos foi desativada para este cliente")
        return clientOpexScope(actor)
    } catch (error) {
        if (error instanceof WatchFailure) throw error
        const { CLIENT_FAILURES } = await import("./jobs")
        const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : null
        throw new WatchFailure((code ? CLIENT_FAILURES[code] : undefined) ?? (error instanceof Error ? error.message : String(error)))
    }
}

const toWake = (doc: WatchDoc): OpexWakeWatch => ({
    id: doc._id.toString(),
    target: { kind: doc.target.kind, id: doc.target.id, label: doc.target.label },
    condition: { event: doc.condition.event, values: doc.condition.values ?? [], labels: doc.condition.labels ?? [] },
    note: doc.note,
    outcome: doc.outcome ?? "event",
    event: doc.event ? { summary: doc.event.summary, short: doc.event.short, at: new Date(doc.event.at) } : null,
    createdAt: new Date(doc.createdAt),
    expiresAt: new Date(doc.expiresAt),
})

/** Encerra observações em entrega sem acordar (sessão excluída, escopo recusado). */
async function closeWithoutWake(docs: WatchDoc[], status: Extract<OpexWatchStatus, "canceled" | "error">, reason: string, now: Date): Promise<void> {
    for (const doc of docs) {
        const updated = await OpexWatch.findOneAndUpdate({ _id: doc._id, status: "delivering" }, { $set: { status, error: reason.slice(0, 1000), deliveryKey: null, purgeAt: purgeAt(now) } }, { new: true }).lean<WatchDoc>()
        if (!updated) continue
        await recordAudit({ userId: auditActor(doc), entidade: OPEX_WATCH_AUDIT_ENTITY, entidadeId: doc._id.toString(), acao: AcaoAuditoria.EXECUTAR, depois: { resultado: status, mensagem: reason, alvo: watchTargetText(doc.target) } })
        log.warn({ watchId: doc._id.toString(), status, reason }, "[opex] observação encerrada sem acordar o agente")
        await publishWatch(updated)
    }
}

/**
 * Entrega as observações disparadas de uma sessão numa única mensagem de sistema (um turno): reserva
 * (`triggered → delivering`), revalida o escopo e envia; com a sessão respondendo, entra na fila. O
 * início do turno marca as observações como acordadas (`markWatchesWoken`).
 */
export async function deliverSessionWatches(sessionId: string, now = new Date()): Promise<"sent" | "queued" | "deferred" | "none" | "closed"> {
    const sessionObjectId = new Types.ObjectId(sessionId)
    const pending = await OpexWatch.find({ sessionId: sessionObjectId, status: "triggered" }).select({ _id: 1 }).lean<{ _id: Types.ObjectId }[]>()
    if (!pending.length) return "none"
    const deliveryKey = randomUUID()
    await OpexWatch.updateMany({ _id: { $in: pending.map((item) => item._id) }, status: "triggered" }, { $set: { status: "delivering", deliveryKey, deliveringAt: now } })
    const docs = await OpexWatch.find({ deliveryKey, status: "delivering" }).sort({ triggeredAt: 1 }).lean<WatchDoc[]>()
    if (!docs.length) return "none"
    const ids = docs.map((doc) => doc._id.toString())

    const session = await OpexSession.findById(sessionObjectId).select({ clientId: 1, userId: 1, agent: 1 }).lean<{ clientId?: string | null; userId?: string; agent?: string }>()
    if (!session || (session.agent && session.agent !== "opex")) {
        await closeWithoutWake(docs, "canceled", "A conversa do Agente Opex não existe mais", now)
        return "closed"
    }
    let scope: OpexServerScope
    if (session.clientId) {
        try {
            scope = await clientScopeForDelivery(session.clientId, session.userId ?? "")
        } catch (error) {
            await closeWithoutWake(docs, "error", error instanceof Error ? error.message : String(error), now)
            return "closed"
        }
    } else {
        const { ownerAgentReady } = await import("./jobs")
        if (!(await ownerAgentReady())) {
            // Agente do dono desligado ou sem modelo: espera e o tick entrega depois (como o job do dono).
            await releaseWatches(ids, "O Agente Opex está indisponível: a notificação será entregue quando ele voltar")
            return "deferred"
        }
        scope = OWNER_SCOPE
    }
    const wake = docs.map(toWake)
    const label = docs.length === 1 ? watchTargetText(docs[0]!.target) : `${docs.length} observações`
    try {
        const { sendWatchMessage } = await import("./runner")
        const result = await sendWatchMessage(sessionId, { kind: "event", text: wakeModelText(wake, formatDate), display: wakeDisplay(wake), watch: { ids, label } }, scope)
        log.info({ sessionId, watchIds: ids, result }, "[opex] notificação de sistema enviada")
        return result === "started" ? "sent" : "queued"
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        log.warn({ sessionId, watchIds: ids, err: reason }, "[opex] falha ao acordar o agente; nova tentativa no tick")
        await releaseWatches(ids, reason)
        return "deferred"
    }
}

/** A mensagem que acordou o agente foi gravada: encerra as observações entregues (chamado pelo runner). */
export async function markWatchesWoken(ids: readonly string[], messageId: string, now = new Date()): Promise<void> {
    await opexDb()
    const docs = await OpexWatch.find({ _id: { $in: ids.filter((id) => Types.ObjectId.isValid(id)) }, status: { $in: ["delivering", "triggered"] } }).lean<WatchDoc[]>()
    for (const doc of docs) {
        const outcome = doc.outcome ?? "event"
        const status: OpexWatchStatus = outcome === "expired" ? "expired" : outcome === "target_deleted" ? "canceled" : "woken"
        const updated = await OpexWatch.findOneAndUpdate(
            { _id: doc._id, status: { $in: ["delivering", "triggered"] } },
            {
                $set: {
                    status,
                    wokenAt: now,
                    messageId: Types.ObjectId.isValid(messageId) ? new Types.ObjectId(messageId) : null,
                    deliveryKey: null,
                    error: outcome === "target_deleted" ? "O alvo foi excluído" : null,
                    purgeAt: purgeAt(now),
                },
            },
            { new: true },
        ).lean<WatchDoc>()
        if (!updated) continue
        await recordAudit({
            userId: auditActor(doc),
            entidade: OPEX_WATCH_AUDIT_ENTITY,
            entidadeId: doc._id.toString(),
            acao: AcaoAuditoria.EXECUTAR,
            depois: {
                resultado: outcome === "event" ? "evento" : outcome === "expired" ? "expirada" : "alvo excluído",
                alvo: watchTargetText(doc.target),
                evento: doc.event?.summary ?? null,
                sessao: doc.sessionId.toString(),
                cliente: doc.clientId ?? null,
                atrasoMs: doc.triggeredAt ? now.getTime() - new Date(doc.triggeredAt).getTime() : null,
            },
        })
        await publishWatch(updated)
    }
}

/** Volta as observações em entrega para "disparada" (o tick entrega de novo). */
export async function releaseWatches(ids: readonly string[], reason: string): Promise<void> {
    await opexDb()
    const valid = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id))
    if (!valid.length) return
    await OpexWatch.updateMany({ _id: { $in: valid }, status: "delivering" }, { $set: { status: "triggered", deliveryKey: null, deliveringAt: null, error: reason.slice(0, 1000) } })
}

/** Vencidas: disparam com o desfecho `expired` (acordam o agente para avisar o usuário). */
async function expireDueWatches(now: Date): Promise<Set<string>> {
    const due = await OpexWatch.find({ status: "watching", expiresAt: { $lte: now } }).sort({ expiresAt: 1 }).limit(EXPIRE_BATCH).lean<WatchDoc[]>()
    const sessions = new Set<string>()
    for (const doc of due) {
        const claimed = await OpexWatch.findOneAndUpdate({ _id: doc._id, status: "watching" }, { $set: { status: "triggered", outcome: "expired", event: null, triggeredAt: now } }, { new: true }).lean<WatchDoc>()
        if (!claimed) continue
        sessions.add(claimed.sessionId.toString())
        await publishWatch(claimed)
    }
    return sessions
}

/** "Acordando" sem turno vivo nem fila neste processo há mais de 2 min: o servidor reiniciou no meio. */
async function recoverLostDeliveries(now: Date): Promise<void> {
    const lost = await OpexWatch.find({ status: "delivering", deliveringAt: { $lte: new Date(now.getTime() - LOST_AFTER_MS) } }).lean<WatchDoc[]>()
    for (const doc of lost) {
        const id = doc._id.toString()
        if (hasQueuedWatch(id) || isTurnActive(doc.sessionId.toString())) continue
        const message = await OpexMessage.findOne({ "watch.ids": id }).select({ _id: 1 }).lean<{ _id: Types.ObjectId }>()
        if (message) await markWatchesWoken([id], message._id.toString(), now)
        else await releaseWatches([id], "A entrega foi interrompida (o servidor reiniciou); nova tentativa")
    }
}

/**
 * Tick das observações (ponto de montagem em `runSchedulerTick`, logo depois dos jobs): vencidas,
 * entregas perdidas e as disparadas pendentes (reservadas pela prévia ou adiadas). Só lê as próprias
 * observações — nunca recalcula o estado dos alvos.
 */
export async function runDueOpexWatches(now = new Date()): Promise<{ expired: number; delivered: number }> {
    await opexDb()
    const expiredSessions = await expireDueWatches(now)
    await recoverLostDeliveries(now)
    const triggered = await OpexWatch.find({ status: "triggered" }).sort({ triggeredAt: 1 }).select({ sessionId: 1 }).lean<{ sessionId: Types.ObjectId }[]>()
    const sessionIds = [...new Set(triggered.map((item) => String(item.sessionId)))].slice(0, DUE_SESSIONS)
    let delivered = 0
    for (const sessionId of sessionIds) {
        try {
            const result = await deliverSessionWatches(sessionId, now)
            if (result === "sent" || result === "queued") delivered++
        } catch (error) {
            log.error({ err: error, sessionId }, "[opex] falha ao entregar as observações da sessão")
        }
    }
    return { expired: expiredSessions.size, delivered }
}
