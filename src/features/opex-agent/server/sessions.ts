import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { publishAppEvent } from "@/lib/pusher/channels"
import { OPEX_AUDIT_ENTITY, OPEX_DEFAULT_TITLE, OPEX_SESSION_DELETED_EVENT, OPEX_SESSION_UPDATED_EVENT } from "../constants"
import { opexFileKind, opexFilePath } from "../files"
import type { OpexFileDto, OpexMessageDto, OpexSessionDetailDto, OpexSessionDto } from "../types"
import { forgetSession, isTurnActive } from "./hub"
import { OpexMessage, OpexPendingAction, OpexSession, type IOpexFileRef, type IOpexMessage, type IOpexSession } from "@/lib/db/models/Opex"

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
        text: doc.text ?? "",
        files: (doc.files ?? []).map(toFileDto),
        parts: doc.parts ?? [],
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

export async function publishSessionUpdated(id: string): Promise<void> {
    await publishAppEvent(OPEX_SESSION_UPDATED_EVENT, { id })
}

/**
 * "Respondendo" sem turno vivo neste processo (servidor reiniciou no meio do turno): volta a ociosa
 * com o aviso, para a sessão não ficar presa.
 */
async function reconcile(doc: SessionDoc): Promise<SessionDoc> {
    if (doc.status !== "running" || isTurnActive(doc._id.toString())) return doc
    const lastError = "A resposta foi interrompida (o servidor reiniciou durante o turno)."
    await OpexSession.updateOne({ _id: doc._id, status: "running" }, { $set: { status: "error", lastError } })
    return { ...doc, status: "error", lastError }
}

export async function loadSession(id: string): Promise<SessionDoc> {
    assertSessionId(id)
    await opexDb()
    const doc = await OpexSession.findById(id).lean<SessionDoc>()
    if (!doc) throw new DomainError(404, "Sessão não encontrada", "OPEX_SESSION_NOT_FOUND")
    return reconcile(doc)
}

export async function listSessions(): Promise<OpexSessionDto[]> {
    await opexDb()
    const docs = await OpexSession.find({}).sort({ lastMessageAt: -1 }).limit(1000).lean<SessionDoc[]>()
    return Promise.all(docs.map(async (doc) => toSessionDto(await reconcile(doc))))
}

export async function getSessionDetail(id: string): Promise<OpexSessionDetailDto> {
    const session = await loadSession(id)
    const messages = await OpexMessage.find({ sessionId: session._id }).sort({ seq: 1 }).select({ modelMessages: 0 }).lean<MessageDoc[]>()
    return { session: toSessionDto(session), messages: messages.map(toMessageDto) }
}

export async function createSession(actorId: string): Promise<OpexSessionDto> {
    await opexDb()
    const doc = await OpexSession.create({ title: OPEX_DEFAULT_TITLE, summary: "", lastMessageAt: new Date() })
    await recordAudit({ userId: actorId, entidade: OPEX_AUDIT_ENTITY, entidadeId: doc._id.toString(), acao: AcaoAuditoria.CRIAR, depois: { titulo: doc.title } })
    await publishSessionUpdated(doc._id.toString())
    return toSessionDto(doc.toObject() as SessionDoc)
}

export async function updateSession(id: string, input: { title?: string; archived?: boolean }, actorId: string): Promise<OpexSessionDto> {
    const before = await loadSession(id)
    const $set: Partial<IOpexSession> = {}
    if (input.title !== undefined) Object.assign($set, { title: input.title, titleSource: "manual" as const })
    if (input.archived !== undefined) $set.archived = input.archived
    const doc = await OpexSession.findByIdAndUpdate(id, { $set }, { new: true }).lean<SessionDoc>()
    if (!doc) throw new DomainError(404, "Sessão não encontrada", "OPEX_SESSION_NOT_FOUND")
    await recordAudit({
        userId: actorId,
        entidade: OPEX_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { titulo: before.title, arquivada: before.archived },
        depois: { titulo: doc.title, arquivada: doc.archived },
    })
    await publishSessionUpdated(id)
    return toSessionDto(doc)
}

export async function deleteSession(id: string, actorId: string): Promise<void> {
    const session = await loadSession(id)
    forgetSession(id)
    // Arquivos primeiro (objetos no storage + metadados), depois o resto da sessão.
    const { deleteSessionFiles } = await import("./files")
    await deleteSessionFiles(id)
    await Promise.all([
        OpexMessage.deleteMany({ sessionId: session._id }),
        OpexPendingAction.deleteMany({ sessionId: session._id }),
        OpexSession.deleteOne({ _id: session._id }),
    ])
    await recordAudit({ userId: actorId, entidade: OPEX_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { titulo: session.title, mensagens: session.messageCount } })
    await publishAppEvent(OPEX_SESSION_DELETED_EVENT, { id })
}
