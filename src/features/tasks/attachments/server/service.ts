import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { attachmentContentPath, attachmentKindOf, attachmentMarkdown, isInlineAttachmentMime, safeAttachmentName } from "@/lib/attachments"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { TaskAttachment, type ITaskAttachment } from "@/lib/db/models/TaskAttachment"
import { DevTask } from "@/lib/db/models/DevTask"
import { OrcamentoDraft } from "@/lib/db/models/Orcamento"
import { FinanceService } from "@/lib/db/models/FinanceService"
import { logger } from "@/lib/logger"
import { copyFile, deleteFile, getFileObject, getUploadUrl, headFile, storageErrorInfo } from "@/lib/storage/s3"
import { TASK_AUDIT_ENTITY } from "@/features/tasks/server/service"
import { SERVICE_AUDIT_ENTITY } from "@/features/services/constants"
import {
    ATTACHMENT_AUDIT_ENTITY,
    ATTACHMENT_FALLBACK_MIME,
    ATTACHMENT_MAX_BYTES,
    ATTACHMENT_PENDING_TTL_MS,
    ATTACHMENT_UPLOAD_URL_TTL_SECONDS,
} from "../constants"
import type { AttachmentListQuery, AttachmentReserveInput } from "../schemas"
import type { AttachmentReservationDto, TaskAttachmentDto, TaskAttachmentListDto } from "../types"
import type { AttachmentActor } from "./actor"

/**
 * Anexos das tarefas — SOMENTE servidor. O binário vai direto do navegador ao **Storage S3** por URL
 * assinada; aqui ficam a reserva, a confirmação, o vínculo, o conteúdo (rota autenticada) e a
 * limpeza.
 *
 * Envio em duas fases: a reserva cria o registro `pending` e assina o PUT para uma chave
 * **temporária**; a confirmação confere o objeto no storage (tamanho e tipo reais), **promove** o
 * arquivo para a chave definitiva (cópia server-side) e marca `ready`. Assim uma URL de upload ainda
 * válida não pode sobrescrever um anexo já confirmado.
 *
 * Falha de storage **não** destrói o envio: só a ausência comprovada do objeto (`404`/`NoSuchKey`)
 * descarta a reserva; recusa de acesso (`403`, que neste storage também é a resposta para objeto
 * inexistente sem permissão de listar) e indisponibilidade viram `502` com a reserva preservada, para
 * repetir a confirmação sem reenviar o arquivo.
 */

export type AttachmentDoc = ITaskAttachment & { _id: unknown }

const OBJECT_ID = /^[a-f0-9]{24}$/i

// ── Autorização ────────────────────────────────────────────────────────────

/** O anexo é visível para o cliente em escopo? O dono alcança tudo. */
const canReach = (actor: AttachmentActor, doc: AttachmentDoc): boolean =>
    actor.kind === "owner" || (doc.clientId !== null && doc.clientId === actor.clientId)

/** Quem enviou (o dono em qualquer sessão; o cliente só o que ele mesmo subiu). */
const isUploader = (actor: AttachmentActor, doc: AttachmentDoc): boolean =>
    doc.uploaderKind === actor.kind && doc.uploaderId === actor.userId

/** Reservas e confirmações: só o autor (ou o dono). */
const canManageUpload = (actor: AttachmentActor, doc: AttachmentDoc): boolean => actor.kind === "owner" || isUploader(actor, doc)

interface TaskRef {
    clientId: string | null
    code?: string
}

async function requireTask(actor: AttachmentActor, taskId: string): Promise<TaskRef> {
    await dbConnect()
    if (!OBJECT_ID.test(taskId)) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    const task = await DevTask.findById(taskId).select({ clientId: 1, code: 1 }).lean()
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    if (actor.kind === "client" && task.clientId !== actor.clientId) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    return { clientId: task.clientId ?? null, code: task.code }
}

async function requireDraft(actor: AttachmentActor, draftId: string): Promise<{ clientId: string | null }> {
    await dbConnect()
    if (!OBJECT_ID.test(draftId)) throw new DomainError(404, "Rascunho não encontrado", "DRAFT_NOT_FOUND")
    const draft = await OrcamentoDraft.findById(draftId).select({ clientId: 1 }).lean()
    if (!draft) throw new DomainError(404, "Rascunho não encontrado", "DRAFT_NOT_FOUND")
    if (actor.kind === "client" && draft.clientId !== actor.clientId) throw new DomainError(404, "Rascunho não encontrado", "DRAFT_NOT_FOUND")
    return { clientId: draft.clientId ?? null }
}

/** Serviço do Financeiro, resolvido no estado **atual** (cliente arquivado/trocado bloqueia na hora). */
async function requireService(actor: AttachmentActor, serviceId: string): Promise<{ clientId: string | null }> {
    await dbConnect()
    if (!OBJECT_ID.test(serviceId)) throw new DomainError(404, "Serviço não encontrado", "SERVICE_NOT_FOUND")
    const service = await FinanceService.findById(serviceId).select({ clientId: 1, archived: 1 }).lean()
    if (!service) throw new DomainError(404, "Serviço não encontrado", "SERVICE_NOT_FOUND")
    if (actor.kind === "client" && (service.clientId !== actor.clientId || service.archived === true)) throw new DomainError(404, "Serviço não encontrado", "SERVICE_NOT_FOUND")
    return { clientId: service.clientId ?? null }
}

/**
 * O anexo de um **serviço** ainda é visível para o ator? O vínculo sozinho não basta: o cliente só
 * vê enquanto o serviço aponta para ele e não está arquivado (arquivar/retrocar o cliente bloqueia o
 * portal imediatamente, sem varrer os anexos).
 */
async function serviceAllowsReach(doc: AttachmentDoc, actor: AttachmentActor): Promise<boolean> {
    if (!doc.serviceId || actor.kind === "owner") return true
    await dbConnect()
    const service = await FinanceService.findById(doc.serviceId).select({ clientId: 1, archived: 1 }).lean()
    return Boolean(service && service.archived !== true && service.clientId === actor.clientId)
}

async function getAttachmentDoc(id: string): Promise<AttachmentDoc> {
    await dbConnect()
    if (!OBJECT_ID.test(id)) throw new DomainError(404, "Anexo não encontrado", "ATTACHMENT_NOT_FOUND")
    const doc = (await TaskAttachment.findById(id).lean()) as AttachmentDoc | null
    if (!doc) throw new DomainError(404, "Anexo não encontrado", "ATTACHMENT_NOT_FOUND")
    return doc
}

// ── Mappers ────────────────────────────────────────────────────────────────

function toAttachmentDto(doc: AttachmentDoc): TaskAttachmentDto {
    const id = String(doc._id)
    const mimeType = doc.mimeType || ATTACHMENT_FALLBACK_MIME
    return {
        id,
        name: doc.name,
        size: doc.size ?? 0,
        mimeType,
        kind: attachmentKindOf(mimeType),
        url: attachmentContentPath(id),
        markdown: attachmentMarkdown({ id, name: doc.name, mimeType }),
        uploaderName: doc.uploaderName || (doc.uploaderKind === "client" ? "Cliente" : "Dono"),
        uploaderKind: doc.uploaderKind === "client" ? "client" : "owner",
        createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    }
}

/** Auditoria do anexo: entra no Histórico da tarefa/serviço quando já está vinculado. */
async function auditAttachment(actor: AttachmentActor, doc: AttachmentDoc, action: "adicionado" | "removido"): Promise<void> {
    if (doc.taskId || doc.serviceId) {
        await recordAudit({
            userId: actor.userId,
            entidade: doc.taskId ? TASK_AUDIT_ENTITY : SERVICE_AUDIT_ENTITY,
            entidadeId: (doc.taskId ?? doc.serviceId)!,
            acao: AcaoAuditoria.ATUALIZAR,
            depois: { anexo: action, arquivo: doc.name, autor: actor.name },
        })
        return
    }
    await recordAudit({
        userId: actor.userId,
        entidade: ATTACHMENT_AUDIT_ENTITY,
        entidadeId: String(doc._id),
        acao: AcaoAuditoria.ATUALIZAR,
        depois: { codigo: doc.name, anexo: action, arquivo: doc.name, autor: actor.name },
    })
}

/** Avisa o dono e o portal que os anexos de uma tarefa mudaram (evento mínimo, `ids`). */
async function notifyTaskChanged(taskId: string): Promise<void> {
    const { publishTasksUpdated } = await import("@/features/tasks/server/service")
    await publishTasksUpdated([taskId])
}

/** Avisa o dono e o portal que os anexos de um serviço mudaram. */
async function notifyServiceChanged(serviceId: string): Promise<void> {
    const { publishServicesUpdated } = await import("@/features/services/server/service")
    await publishServicesUpdated([serviceId])
}

async function removeObjectQuietly(key: string | null | undefined): Promise<boolean> {
    if (!key) return true
    try {
        await deleteFile(key)
        return true
    } catch (error) {
        logger.warn({ err: error, key }, "[attachments] Falha ao remover o objeto no storage")
        return false
    }
}

// ── Upload em duas fases ───────────────────────────────────────────────────

/** Cria o registro `pending` e devolve a URL assinada de PUT para a chave temporária. */
export async function reserveAttachmentUpload(actor: AttachmentActor, input: AttachmentReserveInput): Promise<AttachmentReservationDto> {
    await dbConnect()
    const mimeType = (input.mimeType?.trim() || ATTACHMENT_FALLBACK_MIME).toLowerCase()
    let clientId = actor.clientId
    if (input.taskId) clientId = (await requireTask(actor, input.taskId)).clientId
    else if (input.draftId) clientId = (await requireDraft(actor, input.draftId)).clientId
    else if (input.serviceId) clientId = (await requireService(actor, input.serviceId)).clientId

    const _id = new Types.ObjectId()
    const id = String(_id)
    const name = safeAttachmentName(input.name)
    const uploadKey = `attachments/tmp/${id}/${name}`
    const key = `attachments/${id}/${name}`

    await TaskAttachment.create({
        _id,
        taskId: input.taskId ?? null,
        draftId: input.draftId ?? null,
        serviceId: input.serviceId ?? null,
        uploaderKind: actor.kind,
        uploaderId: actor.userId,
        uploaderName: actor.name,
        clientId,
        name,
        size: input.size,
        mimeType,
        key,
        uploadKey,
        status: "pending",
    })

    const url = await getUploadUrl(uploadKey, mimeType, ATTACHMENT_UPLOAD_URL_TTL_SECONDS, "browser")
    return { id, method: "PUT", url, headers: { "Content-Type": mimeType }, expiresIn: ATTACHMENT_UPLOAD_URL_TTL_SECONDS }
}

/** Descarta um upload inválido: some o objeto (se houver) e o registro. */
async function discardUpload(doc: AttachmentDoc): Promise<void> {
    await removeObjectQuietly(doc.uploadKey)
    await TaskAttachment.deleteOne({ _id: doc._id })
}

/**
 * Confirma o envio: confere o objeto no storage, promove para a chave definitiva e marca `ready`.
 * Idempotente (repetir a confirmação devolve o mesmo anexo).
 */
export async function completeAttachmentUpload(actor: AttachmentActor, id: string): Promise<TaskAttachmentDto> {
    const doc = await getAttachmentDoc(id)
    if (!canManageUpload(actor, doc)) throw new DomainError(403, "Anexo de outro autor", "FORBIDDEN")
    if (doc.status === "ready") return toAttachmentDto(doc)
    if (doc.status !== "pending") throw new DomainError(409, "O anexo não está mais em envio", "ATTACHMENT_NOT_PENDING")

    let head: { contentLength: number | undefined; contentType: string | undefined }
    try {
        head = await headFile(doc.uploadKey)
    } catch (error) {
        const info = storageErrorInfo(error)
        logger.warn({ err: error, attachmentId: String(doc._id), operation: "head", httpStatus: info.httpStatus, code: info.code, kind: info.kind }, "[attachments] Falha ao conferir o objeto na confirmação")
        // Só a ausência comprovada descarta o envio: recusa de acesso, rede ou 5xx preservam a reserva
        // e o objeto temporário, para o usuário repetir a confirmação sem enviar tudo de novo.
        if (info.kind !== "not_found") throw new DomainError(502, "Não foi possível confirmar o arquivo no storage. Tente novamente em instantes.", "ATTACHMENT_STORAGE_UNAVAILABLE")
        await discardUpload(doc)
        throw new DomainError(400, "O arquivo não chegou ao storage. Envie de novo.", "ATTACHMENT_NOT_UPLOADED")
    }

    const size = head.contentLength ?? 0
    if (size <= 0) {
        await discardUpload(doc)
        throw new DomainError(400, "O arquivo enviado está vazio.", "ATTACHMENT_EMPTY")
    }
    if (size > ATTACHMENT_MAX_BYTES) {
        await discardUpload(doc)
        throw new DomainError(413, "Arquivo maior que 100 MB.", "ATTACHMENT_TOO_LARGE")
    }

    try {
        await copyFile(doc.uploadKey, doc.key)
    } catch (error) {
        const info = storageErrorInfo(error)
        logger.warn({ err: error, attachmentId: String(doc._id), operation: "copy", httpStatus: info.httpStatus, code: info.code, kind: info.kind }, "[attachments] Falha ao promover o objeto para a chave definitiva")
        throw new DomainError(502, "Não foi possível finalizar o arquivo no storage. Tente novamente em instantes.", "ATTACHMENT_STORAGE_UNAVAILABLE")
    }
    await removeObjectQuietly(doc.uploadKey)
    const mimeType = (head.contentType?.trim() || doc.mimeType || ATTACHMENT_FALLBACK_MIME).toLowerCase()
    await TaskAttachment.updateOne({ _id: doc._id }, { $set: { status: "ready", size, mimeType } })

    const ready: AttachmentDoc = { ...doc, status: "ready", size, mimeType }
    await auditAttachment(actor, ready, "adicionado")
    if (ready.taskId) await notifyTaskChanged(ready.taskId)
    else if (ready.serviceId) await notifyServiceChanged(ready.serviceId)
    return toAttachmentDto(ready)
}

/** Cancela um upload **ainda não confirmado** (o autor ou o dono). */
export async function cancelAttachmentUpload(actor: AttachmentActor, id: string): Promise<void> {
    const doc = await getAttachmentDoc(id)
    if (!canManageUpload(actor, doc)) throw new DomainError(403, "Anexo de outro autor", "FORBIDDEN")
    if (doc.status === "ready") throw new DomainError(409, "O anexo já foi enviado: exclua-o na lista", "ATTACHMENT_READY")
    await removeObjectQuietly(doc.uploadKey)
    await TaskAttachment.deleteOne({ _id: doc._id })
}

// ── Consulta e conteúdo ────────────────────────────────────────────────────

/** Anexos confirmados de uma tarefa, de um rascunho ou de um serviço. */
export async function listAttachments(actor: AttachmentActor, query: AttachmentListQuery): Promise<TaskAttachmentListDto> {
    await dbConnect()
    if (query.taskId) await requireTask(actor, query.taskId)
    else if (query.serviceId) await requireService(actor, query.serviceId)
    else if (query.draftId) await requireDraft(actor, query.draftId)
    const filter = query.taskId ? { taskId: query.taskId } : query.serviceId ? { serviceId: query.serviceId } : { draftId: query.draftId }
    const docs = (await TaskAttachment.find({ ...filter, status: "ready" })
        .sort({ createdAt: 1 })
        .lean()) as AttachmentDoc[]
    const visible: AttachmentDoc[] = []
    for (const doc of docs) {
        if (!canReach(actor, doc)) continue
        if (!(await serviceAllowsReach(doc, actor))) continue
        visible.push(doc)
    }
    return { attachments: visible.map(toAttachmentDto) }
}

export interface AttachmentContent {
    body: ReadableStream<Uint8Array> | null
    contentType: string
    contentLength: number | null
    contentRange: string | null
    acceptRanges: string
    name: string
    /** `true` quando o tipo é seguro para exibir na página (imagem, áudio ou vídeo). */
    inline: boolean
}

/**
 * Conteúdo do anexo por uma rota autenticada (a URL assinada do storage nunca chega à descrição). Os
 * tipos que não são mídia (inclusive SVG) são servidos como download.
 */
export async function readAttachmentContent(actor: AttachmentActor, id: string, options: { range?: string; download?: boolean } = {}): Promise<AttachmentContent> {
    const doc = await getAttachmentDoc(id)
    if (doc.status !== "ready" || !canReach(actor, doc)) throw new DomainError(404, "Anexo não encontrado", "ATTACHMENT_NOT_FOUND")
    if (!(await serviceAllowsReach(doc, actor))) throw new DomainError(404, "Anexo não encontrado", "ATTACHMENT_NOT_FOUND")
    let file
    try {
        file = await getFileObject(doc.key, { range: options.range })
    } catch (error) {
        const info = storageErrorInfo(error)
        logger.warn({ err: error, attachmentId: String(doc._id), operation: "get", httpStatus: info.httpStatus, code: info.code, kind: info.kind }, "[attachments] Falha ao ler o objeto do storage")
        if (info.kind === "not_found") throw new DomainError(404, "Anexo não encontrado", "ATTACHMENT_NOT_FOUND")
        throw new DomainError(502, "Não foi possível carregar o anexo. Tente novamente em instantes.", "ATTACHMENT_STORAGE_UNAVAILABLE")
    }
    const mimeType = file.contentType?.trim() || doc.mimeType || ATTACHMENT_FALLBACK_MIME
    return {
        body: file.body,
        contentType: mimeType,
        contentLength: file.contentLength ?? doc.size ?? null,
        contentRange: file.contentRange ?? null,
        acceptRanges: file.acceptRanges ?? "bytes",
        name: doc.name,
        inline: options.download !== true && isInlineAttachmentMime(mimeType),
    }
}

// ── Exclusão ───────────────────────────────────────────────────────────────

/**
 * Remove o anexo (objeto + registro). O dono remove qualquer um; o usuário do portal só o que ele
 * mesmo enviou e **ainda não foi vinculado** — anexo de tarefa/rascunho só o dono exclui.
 */
export async function deleteAttachment(actor: AttachmentActor, id: string): Promise<void> {
    const doc = await getAttachmentDoc(id)
    const unlinked = !doc.taskId && !doc.draftId
    const allowed = actor.kind === "owner" || (isUploader(actor, doc) && unlinked)
    if (!allowed) throw new DomainError(403, "Só o dono remove anexos da tarefa.", "FORBIDDEN")
    await removeAttachmentRecord(actor, doc)
}

/** Marca `removing`, apaga o objeto e o registro. Se o storage falhar, a rotina tenta de novo. */
async function removeAttachmentRecord(actor: AttachmentActor, doc: AttachmentDoc): Promise<void> {
    await TaskAttachment.updateOne({ _id: doc._id }, { $set: { status: "removing" } })
    try {
        await deleteFile(doc.key)
        // Um envio ainda não confirmado só tem o objeto temporário no bucket.
        await removeObjectQuietly(doc.uploadKey)
    } catch (error) {
        logger.warn({ err: error, attachmentId: String(doc._id) }, "[attachments] Falha ao remover o objeto; a rotina tentará novamente")
        throw new DomainError(502, "Não foi possível remover o arquivo do storage. Tente novamente.", "ATTACHMENT_DELETE_FAILED")
    }
    await TaskAttachment.deleteOne({ _id: doc._id })
    await auditAttachment(actor, doc, "removido")
    if (doc.taskId) await notifyTaskChanged(doc.taskId)
    else if (doc.serviceId) await notifyServiceChanged(doc.serviceId)
}

// ── Vínculo (criação, rascunho e aprovação) ────────────────────────────────

/**
 * Confere os anexos antes de qualquer efeito externo (criação da issue no GitHub): existem, estão
 * confirmados e são do autor. Evita criar a tarefa e descobrir depois que o anexo é inválido.
 */
export async function assertAttachmentsLinkable(actor: AttachmentActor, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    await dbConnect()
    const docs = (await TaskAttachment.find({ _id: { $in: [...new Set(ids)] } }).lean()) as AttachmentDoc[]
    if (docs.length !== new Set(ids).size) throw new DomainError(400, "Há um anexo inexistente no pedido", "ATTACHMENT_NOT_FOUND")
    for (const doc of docs) {
        if (doc.status !== "ready") throw new DomainError(400, `O anexo "${doc.name}" ainda está em envio`, "ATTACHMENT_NOT_READY")
        if (!canManageUpload(actor, doc)) throw new DomainError(403, `O anexo "${doc.name}" é de outro autor`, "FORBIDDEN")
    }
}

/** Vincula anexos à tarefa (feito **depois** de a tarefa existir). Idempotente. */
export async function linkAttachmentsToTask(actor: AttachmentActor, ids: readonly string[], taskId: string): Promise<void> {
    if (ids.length === 0) return
    const task = await requireTask(actor, taskId)
    await dbConnect()
    await TaskAttachment.updateMany({ _id: { $in: [...new Set(ids)] } }, { $set: { taskId, draftId: null, clientId: task.clientId } })
}

/** Vincula anexos ao rascunho de prévia (portal do cliente ou prévia do dono). */
export async function linkAttachmentsToDraft(actor: AttachmentActor, ids: readonly string[], draftId: string): Promise<void> {
    if (ids.length === 0) return
    const draft = await requireDraft(actor, draftId)
    await dbConnect()
    await TaskAttachment.updateMany({ _id: { $in: [...new Set(ids)] } }, { $set: { draftId, taskId: null, serviceId: null, clientId: draft.clientId } })
}

/** Vincula anexos a um serviço (feito depois de o serviço existir). Idempotente. */
export async function linkAttachmentsToService(actor: AttachmentActor, ids: readonly string[], serviceId: string): Promise<void> {
    if (ids.length === 0) return
    const service = await requireService(actor, serviceId)
    await dbConnect()
    await TaskAttachment.updateMany({ _id: { $in: [...new Set(ids)] } }, { $set: { serviceId, taskId: null, draftId: null, clientId: service.clientId } })
}

/** Transfere os anexos do rascunho aprovado para a tarefa criada. */
export async function moveAttachmentsToTask(draftId: string, taskId: string): Promise<void> {
    await dbConnect()
    const task = await DevTask.findById(taskId).select({ clientId: 1 }).lean()
    await TaskAttachment.updateMany({ draftId }, { $set: { taskId, draftId: null, clientId: task?.clientId ?? null } })
}

/** Mantém a visibilidade dos anexos alinhada ao cliente da tarefa (troca/remoção do cliente). */
export async function syncTaskAttachmentsClient(taskId: string, clientId: string | null): Promise<void> {
    await dbConnect()
    await TaskAttachment.updateMany({ taskId }, { $set: { clientId } })
}

/** Mantém a visibilidade dos anexos alinhada ao cliente do serviço (troca de cliente ao editar). */
export async function syncServiceAttachmentsClient(serviceId: string, clientId: string | null): Promise<void> {
    await dbConnect()
    await TaskAttachment.updateMany({ serviceId }, { $set: { clientId } })
}

/** Anexos que uma tarefa possui (contagem exibida na aba). */
export async function countTaskAttachments(taskId: string): Promise<number> {
    await dbConnect()
    return TaskAttachment.countDocuments({ taskId, status: "ready" })
}

/** Anexos que um serviço possui (contagem exibida no detalhe). */
export async function countServiceAttachments(serviceId: string): Promise<number> {
    await dbConnect()
    return TaskAttachment.countDocuments({ serviceId, status: "ready" })
}

/** Limpa os anexos quando a tarefa é excluída (objetos em melhor esforço, registros sempre). */
export async function deleteAttachmentsForTask(taskId: string): Promise<void> {
    await dbConnect()
    const docs = (await TaskAttachment.find({ taskId }).select({ key: 1, uploadKey: 1, status: 1 }).lean()) as AttachmentDoc[]
    for (const doc of docs) {
        await removeObjectQuietly(doc.key)
        await removeObjectQuietly(doc.uploadKey)
    }
    await TaskAttachment.deleteMany({ taskId })
}

// ── Rotina de limpeza ──────────────────────────────────────────────────────

/**
 * Rotina interna: remove uploads abandonados (nunca vinculados) e conclui remoções físicas que
 * falharam. Os **metadados só somem depois** de o objeto sair do storage.
 */
export async function cleanupAbandonedAttachments(now: Date = new Date()): Promise<string> {
    await dbConnect()
    const cutoff = new Date(now.getTime() - ATTACHMENT_PENDING_TTL_MS)
    const stale = (await TaskAttachment.find({ status: "pending", createdAt: { $lte: cutoff } }).lean()) as AttachmentDoc[]
    let abandoned = 0
    for (const doc of stale) {
        await removeObjectQuietly(doc.uploadKey)
        await removeObjectQuietly(doc.key)
        await TaskAttachment.deleteOne({ _id: doc._id })
        abandoned += 1
    }

    const removing = (await TaskAttachment.find({ status: "removing" }).lean()) as AttachmentDoc[]
    let concluded = 0
    for (const doc of removing) {
        if (!(await removeObjectQuietly(doc.key))) continue
        await removeObjectQuietly(doc.uploadKey)
        await TaskAttachment.deleteOne({ _id: doc._id })
        concluded += 1
    }

    if (!abandoned && !concluded) return "Nenhum anexo pendente"
    const parts: string[] = []
    if (abandoned) parts.push(`${abandoned} upload(s) abandonado(s) removido(s)`)
    if (concluded) parts.push(`${concluded} remoção(ões) concluída(s)`)
    return parts.join("; ")
}
