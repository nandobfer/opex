import { Types } from "mongoose"
import { clientActorFor, type ClientActor } from "@/features/auth/server/context"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { OpexJob, OpexSession, type IOpexJob } from "@/lib/db/models/Opex"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { User } from "@/lib/db/models/User"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { opexChannel } from "@/lib/pusher/channel-names"
import { publishAppEvent, publishToChannels } from "@/lib/pusher/channels"
import { OPEX_CLIENT_TOOLS } from "../client-tools"
import {
    OPEX_JOB_AUDIT_ENTITY,
    OPEX_JOB_FINISHED_EVENT,
    OPEX_JOB_LIST_LIMIT,
    OPEX_JOB_RETENTION_MS,
    OPEX_JOB_UPDATED_EVENT,
    jobModelText,
    resolveRunAt,
    scheduleOf,
    type OpexJobDto,
    type OpexJobFilter,
    type OpexJobFinishedPayload,
    type OpexJobInput,
    type OpexJobListQuery,
    type OpexJobStatus,
} from "../jobs"
import { assertClientOpexEnabled, enabledClientToolNamesFor } from "./client-config"
import { hasQueuedJob, isTurnActive } from "./hub"
import { sendJobMessage } from "./runner"
import { OWNER_SCOPE, clientOpexScope, type OpexServerScope } from "./scope"
import { createSession, opexDb, publishSessionUpdated } from "./sessions"
import { loadOpexSettings, opexAvailability } from "./settings"

const log = loggerFor({ module: "opex-agent", feature: "jobs" })

/** Job "executando" sem turno vivo nem fila depois disto foi perdido (o servidor reiniciou). */
const LOST_AFTER_MS = 2 * 60_000
/** Jobs vencidos disparados por tick (o resto fica para o minuto seguinte). */
const DUE_BATCH = 20

const JOB_TOOL_NAMES = OPEX_CLIENT_TOOLS.filter((tool) => tool.group === "jobs").map((tool) => tool.name)

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
const formatDate = (date: Date) => dateFormatter.format(date)
const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : null)
const idOf = (id: Types.ObjectId | string | null | undefined) => (id ? id.toString() : null)

/** Dono do job: o app do dono (`clientId: null`) ou um usuário de um cliente do portal. */
interface JobOwner {
    clientId: string | null
    userId: string
}

function ownerOfScope(scope: OpexServerScope): JobOwner {
    return scope.kind === "client" ? { clientId: String(scope.actor.client._id), userId: scope.actor.userId } : { clientId: null, userId: getLocalUser().id }
}

const ownerOfJob = (job: Pick<IOpexJob, "clientId" | "userId">): JobOwner => ({ clientId: job.clientId ?? null, userId: job.userId || getLocalUser().id })

/** Filtro das sessões de um dono de job (o dono vê as antigas, sem `clientId`). */
// Jobs são só do Agente Opex: sessão do Agente Maddox nunca é alvo de job.
const sessionFilterOfOwner = (owner: JobOwner) => ({ ...(owner.clientId ? { clientId: owner.clientId, userId: owner.userId } : { clientId: null }), agent: { $ne: "maddox" as const } })

/** Jobs visíveis no escopo: o dono vê todos; o usuário do portal, só os próprios. */
function jobFilterOf(scope: OpexServerScope): Record<string, unknown> {
    if (scope.kind === "owner") return {}
    return { clientId: String(scope.actor.client._id), userId: scope.actor.userId }
}

type Names = { clients: Map<string, string>; users: Map<string, string> }

/** Nomes do cliente e do usuário dos jobs do portal (lista do dono). */
async function namesFor(docs: readonly IOpexJob[]): Promise<Names> {
    const clientIds = [...new Set(docs.map((doc) => doc.clientId).filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id!)))]
    const userIds = [...new Set(docs.filter((doc) => doc.clientId).map((doc) => doc.userId).filter((id) => Types.ObjectId.isValid(id)))]
    const [clients, users] = await Promise.all([
        clientIds.length ? OrcamentoClient.find({ _id: { $in: clientIds } }).select({ name: 1 }).lean<{ _id: Types.ObjectId; name: string }[]>() : [],
        userIds.length ? User.find({ _id: { $in: userIds } }).select({ username: 1 }).lean<{ _id: Types.ObjectId; username: string }[]>() : [],
    ])
    return { clients: new Map(clients.map((item) => [String(item._id), item.name])), users: new Map(users.map((item) => [String(item._id), item.username])) }
}

function originOf(doc: IOpexJob, names: Names | null): OpexJobDto["origin"] {
    if (!doc.clientId) return { kind: "owner" }
    const owner = getLocalUser()
    const userName = doc.userId === owner.id ? `${owner.name} (pré-visualização)` : (names?.users.get(doc.userId) ?? "Usuário removido")
    return { kind: "client", clientId: doc.clientId, clientName: names?.clients.get(doc.clientId) ?? "Cliente excluído", userId: doc.userId, userName }
}

export function toJobDto(doc: IOpexJob, names: Names | null = null): OpexJobDto {
    return {
        id: doc._id.toString(),
        title: doc.title,
        prompt: doc.prompt,
        sessionId: idOf(doc.sessionId),
        resultSessionId: idOf(doc.resultSessionId),
        schedule: doc.schedule,
        runAt: new Date(doc.runAt).toISOString(),
        status: doc.status,
        startedAt: iso(doc.startedAt),
        finishedAt: iso(doc.finishedAt),
        delayMs: doc.delayMs ?? null,
        error: doc.error ?? null,
        createdBy: doc.createdBy ?? "user",
        originSessionId: idOf(doc.originSessionId),
        sourceJobId: idOf(doc.sourceJobId),
        origin: originOf(doc, names),
        createdAt: new Date(doc.createdAt).toISOString(),
    }
}

async function toJobDtos(docs: IOpexJob[]): Promise<OpexJobDto[]> {
    const names = await namesFor(docs)
    return docs.map((doc) => toJobDto(doc, names))
}

function assertJobId(id: string): void {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Job não encontrado", "OPEX_JOB_NOT_FOUND")
}

/** Job **no escopo**: de outro cliente/usuário responde 404 (não revela existência). */
async function findJob(id: string, scope: OpexServerScope): Promise<IOpexJob> {
    assertJobId(id)
    await opexDb()
    const doc = await OpexJob.findOne({ _id: id, ...jobFilterOf(scope) }).lean<IOpexJob>()
    if (!doc) throw new DomainError(404, "Job não encontrado", "OPEX_JOB_NOT_FOUND")
    return doc
}

/** Telas do dono sempre (`private-app`); o job do portal também no canal do usuário. */
async function publishJobEvent(job: Pick<IOpexJob, "clientId" | "userId">, event: string, payload: Record<string, unknown>): Promise<void> {
    await publishAppEvent(event, payload)
    if (job.clientId && job.userId) await publishToChannels([opexChannel(job.clientId, job.userId)], event, payload)
}

async function publishJob(job: Pick<IOpexJob, "clientId" | "userId">, id: string, status: OpexJobStatus): Promise<void> {
    await publishJobEvent(job, OPEX_JOB_UPDATED_EVENT, { id, status })
}

function listQuery(filter: OpexJobFilter): Record<string, unknown> {
    if (filter === "scheduled") return { status: { $in: ["scheduled", "running"] } }
    if (filter === "finished") return { status: { $nin: ["scheduled", "running"] } }
    return {}
}

/** Filtros de origem da lista do dono (ignorados no portal, que só vê os próprios). */
function originQuery(query: Partial<OpexJobListQuery>): Record<string, unknown> {
    if (query.origin === "owner") return { clientId: null }
    const out: Record<string, unknown> = {}
    if (query.origin === "client") out.clientId = { $ne: null }
    if (query.clientId) out.clientId = query.clientId
    if (query.userId) out.userId = query.userId
    return out
}

export async function listOpexJobs(query: Partial<OpexJobListQuery> = {}, scope: OpexServerScope = OWNER_SCOPE): Promise<OpexJobDto[]> {
    await opexDb()
    const filter = query.filter ?? "all"
    const where = { ...listQuery(filter), ...(scope.kind === "owner" ? originQuery(query) : {}), ...jobFilterOf(scope) }
    const docs = await OpexJob.find(where)
        .sort({ runAt: filter === "scheduled" ? 1 : -1 })
        .limit(OPEX_JOB_LIST_LIMIT)
        .lean<IOpexJob[]>()
    return toJobDtos(docs)
}

export async function getOpexJob(id: string, scope: OpexServerScope = OWNER_SCOPE): Promise<OpexJobDto> {
    const [dto] = await toJobDtos([await findJob(id, scope)])
    return dto!
}

/** Sessão escolhida precisa existir e ser do dono do job (400: a entrada é que está errada). */
async function assertSessionExists(sessionId: string | null, owner: JobOwner): Promise<void> {
    if (!sessionId) return
    const exists = Types.ObjectId.isValid(sessionId) ? await OpexSession.exists({ _id: sessionId, ...sessionFilterOfOwner(owner) }) : null
    if (!exists) throw new DomainError(400, "A sessão escolhida não existe mais", "OPEX_JOB_SESSION_NOT_FOUND")
}

function runAtOrThrow(input: OpexJobInput, now: Date): Date {
    const resolved = resolveRunAt(scheduleOf(input), now)
    if ("error" in resolved) throw new DomainError(400, resolved.error, "OPEX_JOB_INVALID_SCHEDULE")
    return resolved.runAt
}

export interface OpexJobOrigin {
    actorId: string
    createdBy: "user" | "agent"
    /** Sessão do agente que agendou (ferramenta). */
    originSessionId?: string | null
}

const objectIdOrNull = (value: string | null | undefined) => (value && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null)

/**
 * Cria o job no escopo; "agora" (ou horário já vencido) começa na hora, sem esperar o tick.
 * Reexecução de um job do portal pelo dono mantém o cliente, o usuário e a sessão do original.
 */
export async function createOpexJob(input: OpexJobInput, origin: OpexJobOrigin, scope: OpexServerScope = OWNER_SCOPE, now = new Date()): Promise<OpexJobDto> {
    await opexDb()
    const runAt = runAtOrThrow(input, now)
    const source = input.sourceJobId && Types.ObjectId.isValid(input.sourceJobId) ? await OpexJob.findOne({ _id: input.sourceJobId, ...jobFilterOf(scope) }).lean<IOpexJob>() : null
    const inherited = scope.kind === "owner" && source?.clientId ? ownerOfJob(source) : null
    const owner = inherited ?? ownerOfScope(scope)
    const sessionId = inherited ? idOf(source!.sessionId) : input.sessionId
    await assertSessionExists(sessionId, owner)
    const doc = await OpexJob.create({
        title: input.title,
        prompt: input.prompt,
        sessionId: objectIdOrNull(sessionId),
        schedule: scheduleOf(input),
        runAt,
        status: "scheduled",
        createdBy: origin.createdBy,
        originSessionId: objectIdOrNull(origin.originSessionId),
        sourceJobId: source?._id ?? null,
        clientId: owner.clientId,
        userId: owner.userId,
    })
    const id = doc._id.toString()
    await recordAudit({
        userId: origin.actorId,
        entidade: OPEX_JOB_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.CRIAR,
        depois: { titulo: input.title, execucao: runAt.toISOString(), sessao: sessionId ?? "nova", origem: origin.createdBy, cliente: owner.clientId, usuario: owner.userId, reexecucaoDe: idOf(source?._id) },
    })
    log.info({ jobId: id, runAt: runAt.toISOString(), createdBy: origin.createdBy, clientId: owner.clientId }, "[opex] job agendado")
    await publishJob(owner, id, "scheduled")
    if (runAt.getTime() <= now.getTime()) await runOpexJob(id, now)
    return getOpexJob(id, scope)
}

/** Edita um job ainda agendado (409 se já saiu da fila; 403 para o dono num job do portal). */
export async function updateOpexJob(id: string, input: OpexJobInput, actorId: string, scope: OpexServerScope = OWNER_SCOPE, now = new Date()): Promise<OpexJobDto> {
    const before = await findJob(id, scope)
    if (scope.kind === "owner" && before.clientId) throw new DomainError(403, "Jobs do portal só podem ser editados pelo próprio usuário do cliente; cancele ou reexecute.", "OPEX_JOB_CLIENT_READONLY")
    if (before.status !== "scheduled") throw new DomainError(409, "Só jobs agendados podem ser editados", "OPEX_JOB_NOT_SCHEDULED")
    const runAt = runAtOrThrow(input, now)
    await assertSessionExists(input.sessionId, ownerOfJob(before))
    const updated = await OpexJob.findOneAndUpdate(
        { _id: before._id, status: "scheduled" },
        { $set: { title: input.title, prompt: input.prompt, sessionId: objectIdOrNull(input.sessionId), schedule: scheduleOf(input), runAt } },
        { new: true },
    ).lean<IOpexJob>()
    if (!updated) throw new DomainError(409, "O job começou a executar e não pode mais ser editado", "OPEX_JOB_NOT_SCHEDULED")
    await recordAudit({
        userId: actorId,
        entidade: OPEX_JOB_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { titulo: before.title, execucao: new Date(before.runAt).toISOString(), sessao: idOf(before.sessionId) ?? "nova" },
        depois: { titulo: updated.title, execucao: runAt.toISOString(), sessao: idOf(updated.sessionId) ?? "nova" },
    })
    await publishJob(before, id, "scheduled")
    if (runAt.getTime() <= now.getTime()) await runOpexJob(id, now)
    return getOpexJob(id, scope)
}

/** Cancela um job agendado (409 se já começou). O dono cancela também os do portal. */
export async function cancelOpexJob(id: string, actorId: string, scope: OpexServerScope = OWNER_SCOPE, now = new Date()): Promise<OpexJobDto> {
    const before = await findJob(id, scope)
    const updated = await OpexJob.findOneAndUpdate(
        { _id: before._id, status: "scheduled" },
        { $set: { status: "canceled", finishedAt: now, purgeAt: new Date(now.getTime() + OPEX_JOB_RETENTION_MS) } },
        { new: true },
    ).lean<IOpexJob>()
    if (!updated) throw new DomainError(409, "Só jobs agendados podem ser cancelados", "OPEX_JOB_NOT_SCHEDULED")
    await recordAudit({ userId: actorId, entidade: OPEX_JOB_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ABORTAR, antes: { titulo: before.title, execucao: new Date(before.runAt).toISOString(), cliente: before.clientId ?? null } })
    await publishJob(before, id, "canceled")
    const [dto] = await toJobDtos([updated])
    return dto!
}

/** Termina o job (falha, aguardando confirmação ou concluído), audita e avisa as telas. */
async function finishJob(job: IOpexJob, status: Extract<OpexJobStatus, "done" | "error" | "awaiting_confirmation">, error: string | null, now = new Date()): Promise<void> {
    const updated = await OpexJob.findOneAndUpdate(
        { _id: job._id, status: "running" },
        { $set: { status, error: error ? error.slice(0, 1000) : null, finishedAt: now, purgeAt: new Date(now.getTime() + OPEX_JOB_RETENTION_MS) } },
        { new: true },
    ).lean<IOpexJob>()
    if (!updated) return
    const id = job._id.toString()
    await recordAudit({
        userId: job.clientId ? job.userId : getLocalUser().id,
        entidade: OPEX_JOB_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.EXECUTAR,
        depois: {
            titulo: job.title,
            resultado: status,
            mensagem: error,
            sessao: idOf(updated.resultSessionId),
            cliente: job.clientId ?? null,
            atrasoMs: updated.delayMs,
            duracaoMs: updated.startedAt ? now.getTime() - new Date(updated.startedAt).getTime() : null,
        },
    })
    log[status === "error" ? "warn" : "info"]({ jobId: id, status, err: error, clientId: job.clientId ?? null }, "[opex] job terminado")
    await publishJob(job, id, status)
    const payload: OpexJobFinishedPayload = { id, title: job.title, status, sessionId: idOf(updated.resultSessionId), error, origin: job.clientId ? "client" : "owner" }
    await publishJobEvent(job, OPEX_JOB_FINISHED_EVENT, { ...payload })
}

/** Motivo pt-BR, acionável, para a falha ao reconstruir o ator do portal. */
const CLIENT_FAILURES: Record<string, string> = {
    UNAUTHENTICATED: "O usuário foi desativado ou removido",
    FORBIDDEN: "O usuário não está mais vinculado ao cliente",
    CLIENT_INACTIVE: "O cliente foi desativado ou excluído",
    CLIENT_NOT_FOUND: "O cliente foi desativado ou excluído",
    OPEX_CLIENT_DISABLED: "O Agente Opex foi desativado para este cliente",
}

class JobFailure extends Error {}

/** Ator do portal revalidado no banco, com o agente e os jobs ainda ligados para o cliente. */
async function clientActorForJob(job: IOpexJob): Promise<ClientActor> {
    try {
        const actor = await clientActorFor(job.userId, job.clientId!)
        await assertClientOpexEnabled(actor)
        const { names } = await enabledClientToolNamesFor(actor)
        if (!JOB_TOOL_NAMES.some((name) => names.includes(name))) throw new JobFailure("Os jobs foram desativados para este cliente")
        return actor
    } catch (error) {
        if (error instanceof JobFailure) throw error
        const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : null
        const reason = code ? CLIENT_FAILURES[code] : undefined
        throw new JobFailure(reason ?? (error instanceof Error ? error.message : String(error)))
    }
}

/** Agente do dono desligado ou sem modelo: o job do dono espera (não falha) e roda depois, com atraso. */
async function ownerAgentReady(): Promise<boolean> {
    const { settings } = await loadOpexSettings()
    return (await opexAvailability(settings)).available
}

/**
 * Executa um job agendado: reivindica (atômico, `scheduled` → `running`), resolve o escopo (dono ou
 * usuário do portal, revalidado no banco) e a sessão (cria uma nova quando não há escolhida) e envia o
 * prompt. O turno roda em segundo plano e conclui o job no fim (`finishJobTurn`). Com a sessão
 * respondendo, o prompt espera na fila dela. Job do dono com o agente indisponível continua agendado.
 */
export async function runOpexJob(id: string, now = new Date(), ownerReady?: boolean): Promise<"started" | "deferred" | "skipped"> {
    await opexDb()
    const pending = await OpexJob.findOne({ _id: id, status: "scheduled" }).select({ clientId: 1 }).lean<Pick<IOpexJob, "clientId">>()
    if (!pending) return "skipped"
    if (!pending.clientId && !(ownerReady ?? (await ownerAgentReady()))) return "deferred"
    const job = await OpexJob.findOneAndUpdate({ _id: new Types.ObjectId(id), status: "scheduled" }, { $set: { status: "running", startedAt: now, error: null } }, { new: true }).lean<IOpexJob>()
    if (!job) return "skipped"
    const delayMs = Math.max(0, now.getTime() - new Date(job.runAt).getTime())
    await OpexJob.updateOne({ _id: job._id }, { $set: { delayMs } })
    await publishJob(job, id, "running")
    try {
        const scope: OpexServerScope = job.clientId ? clientOpexScope(await clientActorForJob(job)) : OWNER_SCOPE
        const owner = ownerOfJob(job)
        let sessionId = idOf(job.sessionId)
        if (sessionId) {
            const exists = await OpexSession.exists({ _id: sessionId, ...sessionFilterOfOwner(owner) })
            if (!exists) throw new JobFailure("A sessão escolhida para o job foi excluída: reexecute o job em uma sessão nova")
        } else {
            sessionId = (await createSession(scope.kind === "client" ? scope.actor.userId : getLocalUser().id, scope)).id
            await OpexSession.updateOne({ _id: sessionId }, { $set: { title: job.title.slice(0, 120) } })
            await publishSessionUpdated(sessionId)
        }
        await OpexJob.updateOne({ _id: job._id }, { $set: { resultSessionId: new Types.ObjectId(sessionId) } })
        const result = await sendJobMessage(
            sessionId,
            {
                kind: "job",
                text: jobModelText({ ...job, createdAt: new Date(job.createdAt), runAt: new Date(job.runAt), delayMs }, formatDate),
                display: job.prompt,
                job: { id, title: job.title },
            },
            scope,
        )
        log.info({ jobId: id, sessionId, result, delayMs, clientId: job.clientId ?? null }, "[opex] job iniciado")
        await publishJob(job, id, "running")
    } catch (error) {
        await finishJob({ ...job, delayMs }, "error", error instanceof Error ? error.message : String(error))
    }
    return "started"
}

/** Fim do turno do job (chamado pelo runner). */
export async function finishJobTurn(jobId: string, outcome: { status: "complete" | "interrupted" | "error"; error: string | null; pendingConfirmation: boolean }): Promise<void> {
    await opexDb()
    const job = await OpexJob.findById(jobId).lean<IOpexJob>()
    if (!job || job.status !== "running") return
    if (outcome.status === "interrupted") return finishJob(job, "error", outcome.error ?? "Resposta interrompida")
    if (outcome.status === "error") return finishJob(job, "error", outcome.error ?? "A resposta falhou")
    return finishJob(job, outcome.pendingConfirmation ? "awaiting_confirmation" : "done", null)
}

/** "Executando" sem turno vivo nem fila neste processo: o servidor reiniciou no meio. */
async function recoverLostJobs(now: Date): Promise<void> {
    const running = await OpexJob.find({ status: "running", startedAt: { $lte: new Date(now.getTime() - LOST_AFTER_MS) } }).lean<IOpexJob[]>()
    for (const job of running) {
        const sessionId = idOf(job.resultSessionId)
        if (hasQueuedJob(job._id.toString()) || (sessionId && isTurnActive(sessionId))) continue
        await finishJob(job, "error", "O turno do job foi perdido (o servidor reiniciou durante a execução)", now)
    }
}

/**
 * Tick dos jobs (ponto de montagem em `runSchedulerTick`): recupera os perdidos e dispara os
 * vencidos — também os atrasados (app desligado ou agendador parado no horário). Os do dono esperam
 * enquanto o agente estiver desligado ou sem modelo.
 */
export async function runDueOpexJobs(now = new Date()): Promise<string[]> {
    await opexDb()
    await recoverLostJobs(now)
    const ownerReady = await ownerAgentReady()
    const due = await OpexJob.find({ status: "scheduled", runAt: { $lte: now }, ...(ownerReady ? {} : { clientId: { $ne: null } }) })
        .sort({ runAt: 1 })
        .limit(DUE_BATCH)
        .select({ _id: 1 })
        .lean<Pick<IOpexJob, "_id">[]>()
    const started: string[] = []
    for (const item of due) {
        const id = item._id.toString()
        try {
            if ((await runOpexJob(id, now, ownerReady)) === "started") started.push(id)
        } catch (error) {
            log.error({ err: error, jobId: id }, "[opex] falha ao disparar o job")
        }
    }
    return started
}
