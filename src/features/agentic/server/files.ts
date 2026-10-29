import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { fallbackAttachmentName, formatAttachmentSize, isInlineAttachmentMime, safeAttachmentName } from "@/lib/attachments"
import { chatFileKind, megabytesToBytes, type ChatFileDto, type ChatFileReservationDto, type ReserveChatFileInput } from "@/lib/chat-files/kind"
import { dbConnect } from "@/lib/db"
import { AgenticFile, type IAgenticFile } from "@/lib/db/models/Agentic"
import { loggerFor } from "@/lib/logger"
import { getFileObject, getFileUrl, getUploadUrl, storageErrorInfo } from "@/lib/storage/s3"
import { promoteStagedUpload, removeStoredObjectQuietly, StagedUploadError } from "@/lib/storage/staged-upload"
import {
    AGENTIC_FILE_CLEANUP_INTERVAL_MS,
    AGENTIC_FILE_LINK_TTL_SECONDS,
    AGENTIC_FILE_PENDING_TTL_MS,
    AGENTIC_FILE_SIZE_MB,
    AGENTIC_FILE_UPLOAD_URL_TTL_SECONDS,
    AGENTIC_FILES_PER_MESSAGE,
    agenticFilePath,
    attachmentsPromptSection,
    pickAttachedFiles,
} from "../files"

/**
 * Anexos dos campos da mesa de trabalho — SOMENTE servidor. O binário vai direto do navegador ao
 * **Storage S3** (envio em duas fases de `@/lib/storage/staged-upload`); `agentic_files` guarda só os
 * metadados. O arquivo nasce sem dono e é vinculado à mesa (e ao fork) quando vai numa mensagem; no
 * turno, vira anexo do prompt do OpenCode e/ou link assinado para o agente baixar.
 */

const FALLBACK_MIME = "application/octet-stream"
// Logger sob demanda: os testes da mesa mocam `@/lib/logger` só com `logger`.
const log = () => loggerFor({ module: "agentic", feature: "files" })

type AgenticFileDoc = IAgenticFile

/** Referência de um anexo vinculado (guardada no turno e publicada no evento `user`, sem URL assinada). */
export interface AgenticFileRef {
    id: string
    name: string
    mediaType: string
    size: number
}

/** Anexo enviado com o prompt do OpenCode (`data:` URI com o conteúdo em base64). */
export interface PromptFile {
    name: string
    uri: string
}

export const toAgenticFileDto = (file: AgenticFileRef): ChatFileDto => ({ ...file, kind: chatFileKind(file.mediaType, file.name), url: agenticFilePath(file.id) })

const refOf = (doc: Pick<AgenticFileDoc, "_id" | "name" | "mediaType" | "size">): AgenticFileRef => ({ id: doc._id.toString(), name: doc.name, mediaType: doc.mediaType, size: doc.size })

const notFound = () => new DomainError(404, "Arquivo não encontrado", "AGENTIC_FILE_NOT_FOUND")
const maxBytes = megabytesToBytes(AGENTIC_FILE_SIZE_MB)
const tooLarge = (size: number) => new DomainError(413, `O arquivo tem ${formatAttachmentSize(size)}: o limite é ${formatAttachmentSize(maxBytes)}`, "AGENTIC_FILE_TOO_LARGE")

async function findFile(id: string): Promise<AgenticFileDoc> {
    if (!Types.ObjectId.isValid(id)) throw notFound()
    await dbConnect()
    const doc = await AgenticFile.findById(id).lean<AgenticFileDoc>()
    if (!doc) throw notFound()
    return doc
}

async function discard(doc: Pick<AgenticFileDoc, "_id" | "uploadKey">): Promise<void> {
    await removeStoredObjectQuietly(doc.uploadKey)
    await AgenticFile.deleteOne({ _id: doc._id })
}

// ── Envio em duas fases ────────────────────────────────────────────────────

/** Reserva o envio de um arquivo para a próxima mensagem (fica sem dono até ir numa mensagem). */
export async function reserveAgenticFile(input: ReserveChatFileInput): Promise<ChatFileReservationDto> {
    await dbConnect()
    void cleanupPendingAgenticFilesThrottled()
    if (input.size > maxBytes) throw tooLarge(input.size)
    const mediaType = (input.mediaType?.trim() || FALLBACK_MIME).toLowerCase()
    const name = safeAttachmentName(input.name.trim() || fallbackAttachmentName(mediaType))
    const _id = new Types.ObjectId()
    const id = _id.toString()
    const uploadKey = `agentic/tmp/${id}/${name}`
    await AgenticFile.create({ _id, workbenchId: null, forkId: null, claimedAt: null, name, mediaType, size: input.size, key: `agentic/files/${id}/${name}`, uploadKey, ready: false })
    let url: string
    try {
        url = await getUploadUrl(uploadKey, mediaType, AGENTIC_FILE_UPLOAD_URL_TTL_SECONDS, "browser")
    } catch (error) {
        await AgenticFile.deleteOne({ _id })
        log().warn({ err: error instanceof Error ? error.message : error }, "[agentic] storage indisponível ao reservar o envio")
        throw new DomainError(503, "O Storage S3 não está configurado ou não respondeu. Configure em Integrações › Storage S3.", "AGENTIC_FILE_STORAGE_UNAVAILABLE")
    }
    return { id, method: "PUT", url, headers: { "Content-Type": mediaType }, expiresIn: AGENTIC_FILE_UPLOAD_URL_TTL_SECONDS }
}

/** Confirma o envio (confere e promove o objeto no storage). Idempotente. */
export async function completeAgenticFile(id: string): Promise<ChatFileDto> {
    const doc = await findFile(id)
    if (doc.ready) return toAgenticFileDto(refOf(doc))
    let promoted: { size: number; contentType: string | undefined }
    try {
        promoted = await promoteStagedUpload({ uploadKey: doc.uploadKey!, key: doc.key, maxBytes })
    } catch (error) {
        if (!(error instanceof StagedUploadError)) throw error
        if (error.discard) await discard(doc)
        switch (error.failure) {
            case "not_uploaded":
                throw new DomainError(400, "O arquivo não chegou ao storage. Envie de novo.", "AGENTIC_FILE_NOT_UPLOADED")
            case "empty":
                throw new DomainError(400, "O arquivo enviado está vazio.", "AGENTIC_FILE_EMPTY")
            case "too_large":
                throw tooLarge(error.size ?? 0)
            default:
                throw new DomainError(502, "Não foi possível confirmar o arquivo no storage. Tente novamente em instantes.", "AGENTIC_FILE_STORAGE_UNAVAILABLE")
        }
    }
    const mediaType = (doc.mediaType === FALLBACK_MIME && promoted.contentType ? promoted.contentType : doc.mediaType).toLowerCase()
    await AgenticFile.updateOne({ _id: doc._id }, { $set: { ready: true, size: promoted.size, mediaType, uploadKey: null } })
    return toAgenticFileDto(refOf({ ...doc, size: promoted.size, mediaType }))
}

/** Remove um arquivo que ainda não foi numa mensagem (o chip removido antes de enviar). */
export async function deletePendingAgenticFile(id: string): Promise<void> {
    const doc = await findFile(id)
    if (doc.workbenchId) throw new DomainError(409, "O arquivo já foi enviado numa mensagem", "AGENTIC_FILE_SENT")
    await removeStoredObjectQuietly(doc.uploadKey)
    await removeStoredObjectQuietly(doc.key)
    await AgenticFile.deleteOne({ _id: doc._id })
}

/** Conteúdo do arquivo: imagem, áudio e vídeo inline; o resto sempre baixa. Aceita `Range`. */
export async function agenticFileContent(id: string, options: { download?: boolean; range?: string } = {}): Promise<Response> {
    const doc = await findFile(id)
    if (!doc.ready) throw notFound()
    const mediaType = doc.mediaType || FALLBACK_MIME
    const inline = !options.download && isInlineAttachmentMime(mediaType)
    const headers: Record<string, string> = {
        "Content-Type": mediaType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
    }
    let file: Awaited<ReturnType<typeof getFileObject>>
    try {
        file = await getFileObject(doc.key, options.range ? { range: options.range } : {})
    } catch (error) {
        if (storageErrorInfo(error).kind === "not_found") throw notFound()
        throw new DomainError(502, "Não foi possível carregar o arquivo. Tente novamente em instantes.", "AGENTIC_FILE_STORAGE_UNAVAILABLE")
    }
    headers["Accept-Ranges"] = file.acceptRanges ?? "bytes"
    if (file.contentLength != null) headers["Content-Length"] = String(file.contentLength)
    if (file.contentRange) headers["Content-Range"] = file.contentRange
    return new Response(file.body, { status: file.contentRange ? 206 : 200, headers })
}

// ── Vínculo à mesa e entrega ao agente ─────────────────────────────────────

/**
 * Confere os anexos de uma mensagem antes do turno: confirmados, sem dono (ou já desta mesa, numa
 * retomada) e dentro do limite. Não vincula: o vínculo é feito por `claimAgenticFiles` quando a ação
 * é aceita.
 */
export async function loadClaimableFiles(fileIds: readonly string[] | undefined, workbenchId: string | null): Promise<AgenticFileRef[]> {
    const ids = [...new Set(fileIds ?? [])]
    if (!ids.length) return []
    if (ids.length > AGENTIC_FILES_PER_MESSAGE) throw new DomainError(400, `Envie até ${AGENTIC_FILES_PER_MESSAGE} arquivo(s) por mensagem`, "AGENTIC_TOO_MANY_FILES")
    if (ids.some((id) => !Types.ObjectId.isValid(id))) throw new DomainError(400, "Arquivo anexado inválido: anexe de novo", "AGENTIC_FILE_NOT_FOUND")
    await dbConnect()
    const owners = workbenchId ? [null, workbenchId] : [null]
    const docs = await AgenticFile.find({ _id: { $in: ids }, ready: true, workbenchId: { $in: owners } }).lean<AgenticFileDoc[]>()
    if (docs.length !== ids.length) throw new DomainError(400, "Algum arquivo não foi encontrado (expirou, ainda está em envio ou já foi enviado): anexe de novo", "AGENTIC_FILE_NOT_FOUND")
    const byId = new Map(docs.map((doc) => [doc._id.toString(), refOf(doc)]))
    return ids.map((id) => byId.get(id)!)
}

/** Vincula os anexos à mesa (e ao fork): saem da limpeza dos pendentes e passam a ser apagados com a mesa. */
export async function claimAgenticFiles(files: readonly AgenticFileRef[], owner: { workbenchId: string; forkId?: string | null }): Promise<void> {
    if (!files.length) return
    await AgenticFile.updateMany(
        { _id: { $in: files.map((file) => new Types.ObjectId(file.id)) }, workbenchId: { $in: [null, owner.workbenchId] } },
        { $set: { workbenchId: owner.workbenchId, forkId: owner.forkId ?? null, claimedAt: new Date() } },
    )
}

/** `fileIds` do turno (vazio = sem a chave, para não gravar listas vazias). */
export const fileIdsOf = (files: readonly AgenticFileRef[]): { fileIds?: string[] } => (files.length ? { fileIds: files.map((file) => file.id) } : {})

/** Anexos de uma mensagem ao vivo: conteúdo e links para o agente e os metadados para a saída. */
export async function liveAttachments(files: readonly AgenticFileRef[], downloadDir: string): Promise<{ files: PromptFile[]; section: string; shown: ChatFileDto[] }> {
    const prompt = await promptFilesFor(files.map((file) => file.id), { downloadDir })
    return { ...prompt, shown: files.map(toAgenticFileDto) }
}

/** Anexos (na ordem pedida) para mostrar na saída da mesa; ids que não existem mais são ignorados. */
export async function fileDtosFor(fileIds: readonly string[] | undefined): Promise<ChatFileDto[]> {
    const ids = [...new Set(fileIds ?? [])].filter((id) => Types.ObjectId.isValid(id))
    if (!ids.length) return []
    await dbConnect()
    const docs = await AgenticFile.find({ _id: { $in: ids }, ready: true }).lean<AgenticFileDoc[]>()
    const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]))
    return ids.flatMap((id) => {
        const doc = byId.get(id)
        return doc ? [toAgenticFileDto(refOf(doc))] : []
    })
}

/** Conteúdo do arquivo no storage. */
async function readBytes(key: string, signal?: AbortSignal): Promise<Uint8Array> {
    const file = await getFileObject(key)
    if (signal?.aborted) return new Uint8Array()
    if (!file.body) return new Uint8Array()
    return new Uint8Array(await new Response(file.body).arrayBuffer())
}

/**
 * Anexos de um turno: imagens, PDFs e textos (até os tetos) vão como `data:` URI no prompt; todos
 * entram na seção do prompt com um link assinado (24 h). Melhor esforço: o que não baixa fica só com o
 * link; sem link, fica só o nome.
 */
export async function promptFilesFor(fileIds: readonly string[] | undefined, options: { downloadDir: string; signal?: AbortSignal }): Promise<{ files: PromptFile[]; section: string }> {
    const ids = [...new Set(fileIds ?? [])].filter((id) => Types.ObjectId.isValid(id))
    if (!ids.length) return { files: [], section: "" }
    await dbConnect()
    const docs = await AgenticFile.find({ _id: { $in: ids }, ready: true }).lean<AgenticFileDoc[]>()
    const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]))
    const ordered = ids.map((id) => byId.get(id)).filter((doc): doc is AgenticFileDoc => Boolean(doc))
    const withKind = ordered.map((doc) => ({ doc, kind: chatFileKind(doc.mediaType, doc.name), size: doc.size }))
    const eligible = pickAttachedFiles(withKind)
    const files: PromptFile[] = []
    const entries = []
    for (const item of withKind) {
        let attached = false
        if (eligible.has(item) && !options.signal?.aborted) {
            try {
                const bytes = await readBytes(item.doc.key, options.signal)
                if (bytes.byteLength > 0) {
                    files.push({ name: item.doc.name, uri: `data:${item.doc.mediaType || FALLBACK_MIME};base64,${Buffer.from(bytes).toString("base64")}` })
                    attached = true
                }
            } catch (error) {
                log().warn({ err: error instanceof Error ? error.message : error, fileId: item.doc._id.toString() }, "[agentic] anexo não baixado para o prompt: segue só o link")
            }
        }
        let url: string | null = null
        try {
            url = await getFileUrl(item.doc.key, { downloadName: item.doc.name, expiresIn: AGENTIC_FILE_LINK_TTL_SECONDS })
        } catch (error) {
            log().warn({ err: error instanceof Error ? error.message : error, fileId: item.doc._id.toString() }, "[agentic] link do anexo não gerado")
        }
        entries.push({ name: item.doc.name, mediaType: item.doc.mediaType, size: item.doc.size, kind: item.kind, attached, url })
    }
    return { files, section: attachmentsPromptSection(entries, options.downloadDir) }
}

// ── Limpeza ────────────────────────────────────────────────────────────────

async function removeDocs(filter: Record<string, unknown>): Promise<void> {
    await dbConnect()
    const docs = await AgenticFile.find(filter).select({ key: 1, uploadKey: 1 }).lean<Pick<AgenticFileDoc, "_id" | "key" | "uploadKey">[]>()
    for (const doc of docs) {
        await removeStoredObjectQuietly(doc.uploadKey)
        await removeStoredObjectQuietly(doc.key)
    }
    if (docs.length) await AgenticFile.deleteMany({ _id: { $in: docs.map((doc) => doc._id) } })
}

/** Mesa excluída: apaga os objetos (melhor esforço) e os metadados de todos os anexos dela. */
export async function deleteWorkbenchFiles(workbenchId: string): Promise<void> {
    await removeDocs({ workbenchId })
}

/** Fork descartado: apaga os anexos enviados nas mensagens dele. */
export async function deleteForkFiles(forkId: string): Promise<void> {
    await removeDocs({ forkId })
}

/** Remove os anexos enviados e nunca usados numa mensagem há mais de 24 h (o metadado só sai depois do objeto). */
export async function cleanupPendingAgenticFiles(now: Date = new Date()): Promise<{ removed: number; failed: number }> {
    await dbConnect()
    const cutoff = new Date(now.getTime() - AGENTIC_FILE_PENDING_TTL_MS)
    const stale = await AgenticFile.find({ workbenchId: null, createdAt: { $lte: cutoff } }).select({ key: 1, uploadKey: 1 }).lean<Pick<AgenticFileDoc, "_id" | "key" | "uploadKey">[]>()
    let removed = 0
    let failed = 0
    for (const doc of stale) {
        const ok = (await removeStoredObjectQuietly(doc.uploadKey)) && (await removeStoredObjectQuietly(doc.key))
        if (!ok) {
            failed += 1
            continue
        }
        await AgenticFile.deleteOne({ _id: doc._id })
        removed += 1
    }
    if (removed || failed) log().info({ removed, failed }, "[agentic] limpeza dos anexos pendentes")
    return { removed, failed }
}

const cleanupState = globalThis as typeof globalThis & { __agenticFilesCleanupAt?: number }

/** Limpeza oportunista: no máximo uma vez por hora, disparada pelas reservas, sem atrasar a resposta. */
export async function cleanupPendingAgenticFilesThrottled(now = Date.now()): Promise<void> {
    if (cleanupState.__agenticFilesCleanupAt && now - cleanupState.__agenticFilesCleanupAt < AGENTIC_FILE_CLEANUP_INTERVAL_MS) return
    cleanupState.__agenticFilesCleanupAt = now
    await cleanupPendingAgenticFiles(new Date(now)).catch((error: unknown) => log().warn({ err: error instanceof Error ? error.message : error }, "[agentic] falha na limpeza dos anexos pendentes"))
}
