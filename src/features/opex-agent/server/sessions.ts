import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { publishAppEvent, publishToChannels } from "@/lib/pusher/channels"
import { opexChannel } from "@/lib/pusher/channel-names"
import { OPEX_DEFAULT_TITLE, agentAuditEntity, agentSessionEvents } from "../constants"
import { opexFileKind, opexFilePath } from "../files"
import { normalizeOpexParts } from "../live-message"
import type { OpexFileDto, OpexMessageDto, OpexSessionDetailDto, OpexSessionDto } from "../types"
import { forgetSession, isTurnActive } from "./hub"
import { OWNER_SCOPE, agentOf, sessionFilterOf, type OpexServerScope } from "./scope"
import { OpexJob, OpexMessage, OpexPendingAction, OpexSession, type IOpexFileRef, type IOpexMessage, type IOpexSession } from "@/lib/db/models/Opex"

/** Conecta ao banco (os índices das coleções vêm da migração `ensure-opex-indexes`). */
export async function opexDb(): Promise<void> {
    await dbConnect()
}

type SessionDoc = IOpexSession & { _id: Types.ObjectId }
type MessageDoc = IOpexMessage & { _id: Types.ObjectId }

export function toSessionDto(doc: SessionDoc): OpexSessionDto {
    return {
        id: doc._id.toString(),
        title: doc.title,
        summary: doc.summary ?? "",
        titleSource: doc.titleSource ?? "auto",
        status: doc.status ?? "idle",
        lastError: doc.lastError ?? null,
        archived: Boolean(doc.archived),
        messageCount: doc.messageCount ?? 0,
        lastMessageAt: new Date(doc.lastMessageAt ?? doc.createdAt).toISOString(),
        createdAt: new Date(doc.createdAt).toISOString(),
        ...(doc.agent === "maddox" ? { modelOverride: doc.modelOverride ?? null } : {}),
    }
}

export function toFileDto(file: IOpexFileRef): OpexFileDto {
    return { id: file.id, name: file.name, mediaType: file.mediaType, size: file.size, kind: opexFileKind(file.mediaType, file.name), url: opexFilePath(file.id) }
}

export function toMessageDto(doc: MessageDoc): OpexMessageDto {
    return {
        id: doc._id.toString(),
        role: doc.role,
        kind: doc.kind ?? "message",
        job: doc.job ?? null,
        text: doc.text ?? "",
        files: (doc.files ?? []).map(toFileDto),
        parts: normalizeOpexParts(doc.parts ?? []),
        status: doc.status ?? "complete",
        error: doc.error ?? null,
        usage: doc.usage ?? null,
        durationMs: doc.durationMs ?? null,
        model: doc.model ?? null,
        createdAt: new Date(doc.createdAt).toISOString(),
    }
}

export function assertSessionId(id: string): void {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Sessão não encontrada", "OPEX_SESSION_NOT_FOUND")
}

/**
 * Avisa o dono (`private-app`) ou o usuário dono da sessão no portal
 * (`private-opex-{clientId}-{userId}`), conforme o escopo gravado na sessão.
 */
export async function publishSessionUpdated(id: string): Promise<void> {
    const doc = await OpexSession.findById(id).select({ clientId: 1, userId: 1, agent: 1 }).lean<Pick<IOpexSession, "clientId" | "userId" | "agent">>()
    const event = agentSessionEvents(doc?.agent).updated
    if (doc?.clientId && doc.userId) await publishToChannels([opexChannel(doc.clientId, doc.userId)], event, { id })
    else await publishAppEvent(event, { id })
}

/** Mesma escolha de canal do `publishSessionUpdated`, para a exclusão (evento do agente da sessão). */
async function publishSessionDeleted(session: Pick<IOpexSession, "clientId" | "userId" | "agent">, id: string): Promise<void> {
    const event = agentSessionEvents(session.agent).deleted
    if (session.clientId && session.userId) await publishToChannels([opexChannel(session.clientId, session.userId)], event, { id })
    else await publishAppEvent(event, { id })
}

/**
 * "Respondendo" sem turno vivo neste processo (servidor reiniciou no meio do turno): volta a ociosa
 * com o aviso, para a sessão não ficar presa.
 */
async function reconcile(doc: SessionDoc): Promise<SessionDoc> {
    // No Maddox, "aguardando confirmação" também depende do turno vivo (o pedido está no OpenCode).
    const live = doc.status === "running" || (doc.agent === "maddox" && doc.status === "awaiting_confirmation")
    if (!live || isTurnActive(doc._id.toString())) return doc
    const lastError = "A resposta foi interrompida (o servidor reiniciou durante o turno)."
    await OpexSession.updateOne({ _id: doc._id, status: doc.status }, { $set: { status: "error", lastError, pendingRequests: [] } })
    // Agente Maddox: a execução pode continuar no OpenCode sem ninguém acompanhando; interrompe lá também.
    if (doc.agent === "maddox" && doc.opencodeSessionId) {
        const { interruptOpencodeSession } = await import("@/features/maddox-agent/server/opencode-session")
        void interruptOpencodeSession(doc.opencodeSessionId)
    }
    return { ...doc, status: "error", lastError }
}

/** Sessão **no escopo**: de outro cliente/usuário responde 404 (não revela existência). */
export async function loadSession(id: string, scope: OpexServerScope = OWNER_SCOPE): Promise<SessionDoc> {
    assertSessionId(id)
    await opexDb()
    const doc = await OpexSession.findOne({ _id: id, ...sessionFilterOf(scope) }).lean<SessionDoc>()
    if (!doc) throw new DomainError(404, "Sessão não encontrada", "OPEX_SESSION_NOT_FOUND")
    return reconcile(doc)
}

/** Sessão sem filtro de escopo: usada só para reconstruir o escopo gravado (follow-up/confirmação). */
export async function loadSessionRaw(id: string): Promise<SessionDoc> {
    assertSessionId(id)
    await opexDb()
    const doc = await OpexSession.findById(id).lean<SessionDoc>()
    if (!doc) throw new DomainError(404, "Sessão não encontrada", "OPEX_SESSION_NOT_FOUND")
    return reconcile(doc)
}

export async function listSessions(scope: OpexServerScope = OWNER_SCOPE): Promise<OpexSessionDto[]> {
    await opexDb()
    const docs = await OpexSession.find(sessionFilterOf(scope)).sort({ lastMessageAt: -1 }).limit(1000).lean<SessionDoc[]>()
    return Promise.all(docs.map(async (doc) => toSessionDto(await reconcile(doc))))
}

export async function getSessionDetail(id: string, scope: OpexServerScope = OWNER_SCOPE): Promise<OpexSessionDetailDto> {
    const session = await loadSession(id, scope)
    const messages = await OpexMessage.find({ sessionId: session._id }).sort({ seq: 1 }).select({ modelMessages: 0 }).lean<MessageDoc[]>()
    return { session: toSessionDto(session), messages: messages.map(toMessageDto) }
}

export async function createSession(actorId: string, scope: OpexServerScope = OWNER_SCOPE, extra?: Partial<Pick<IOpexSession, "modelOverride">>): Promise<OpexSessionDto> {
    await opexDb()
    const doc = await OpexSession.create({
        title: OPEX_DEFAULT_TITLE,
        summary: "",
        lastMessageAt: new Date(),
        clientId: scope.kind === "client" ? String(scope.actor.client._id) : null,
        userId: scope.kind === "client" ? scope.actor.userId : actorId,
        agent: agentOf(scope),
        ...(extra ?? {}),
    })
    await recordAudit({ userId: actorId, entidade: agentAuditEntity(agentOf(scope)), entidadeId: doc._id.toString(), acao: AcaoAuditoria.CRIAR, depois: { titulo: doc.title } })
    await publishSessionUpdated(doc._id.toString())
    return toSessionDto(doc.toObject() as SessionDoc)
}

export async function updateSession(id: string, input: { title?: string; archived?: boolean }, actorId: string, scope: OpexServerScope = OWNER_SCOPE): Promise<OpexSessionDto> {
    const before = await loadSession(id, scope)
    const $set: Partial<IOpexSession> = {}
    if (input.title !== undefined) Object.assign($set, { title: input.title, titleSource: "manual" as const })
    if (input.archived !== undefined) $set.archived = input.archived
    const doc = await OpexSession.findByIdAndUpdate(id, { $set }, { new: true }).lean<SessionDoc>()
    if (!doc) throw new DomainError(404, "Sessão não encontrada", "OPEX_SESSION_NOT_FOUND")
    await recordAudit({
        userId: actorId,
        entidade: agentAuditEntity(agentOf(scope)),
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { titulo: before.title, arquivada: before.archived },
        depois: { titulo: doc.title, arquivada: doc.archived },
    })
    await publishSessionUpdated(id)
    return toSessionDto(doc)
}

/** Cliente excluído: apaga as sessões do agente, mensagens, ações, arquivos e jobs (sem escopo de ator). */
export async function deleteClientOpexData(clientId: string): Promise<void> {
    await opexDb()
    await OpexJob.deleteMany({ clientId })
    const sessions = await OpexSession.find({ clientId }).select({ _id: 1, agent: 1, opencodeSessionId: 1 }).lean<Pick<SessionDoc, "_id" | "agent" | "opencodeSessionId">[]>()
    for (const session of sessions) {
        const id = session._id.toString()
        forgetSession(id)
        if (session.agent === "maddox" && session.opencodeSessionId) {
            const { removeOpencodeSession } = await import("@/features/maddox-agent/server/opencode-session")
            await removeOpencodeSession(session.opencodeSessionId)
        }
        const { deleteSessionFiles } = await import("./files")
        await deleteSessionFiles(id)
        await Promise.all([OpexMessage.deleteMany({ sessionId: session._id }), OpexPendingAction.deleteMany({ sessionId: session._id }), OpexSession.deleteOne({ _id: session._id })])
    }
}

export async function deleteSession(id: string, actorId: string, scope: OpexServerScope = OWNER_SCOPE): Promise<void> {
    const session = await loadSession(id, scope)
    forgetSession(id)
    // Arquivos primeiro (objetos no storage + metadados), depois o resto da sessão.
    const { deleteSessionFiles } = await import("./files")
    await deleteSessionFiles(id)
    await Promise.all([
        OpexMessage.deleteMany({ sessionId: session._id }),
        OpexPendingAction.deleteMany({ sessionId: session._id }),
        OpexSession.deleteOne({ _id: session._id }),
    ])
    if (session.agent === "maddox" && session.opencodeSessionId) {
        const { removeOpencodeSession } = await import("@/features/maddox-agent/server/opencode-session")
        await removeOpencodeSession(session.opencodeSessionId)
    }
    await recordAudit({ userId: actorId, entidade: agentAuditEntity(agentOf(scope)), entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { titulo: session.title, mensagens: session.messageCount } })
    await publishSessionDeleted(session, id)
}
