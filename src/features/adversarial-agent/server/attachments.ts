import { listAttachments, readAttachmentContent } from "@/features/tasks/attachments/server/service"
import { ownerAttachmentActor } from "@/features/tasks/attachments/server/actor"
import type { TaskAttachmentDto } from "@/features/tasks/attachments/types"
import { loggerFor } from "@/lib/logger"
import { ADVERSARIAL_FILE_MB_MAX, ADVERSARIAL_FILES_TOTAL_MB } from "../constants"

const log = loggerFor({ module: "adversarial-agent", feature: "attachments" })
const MB = 1024 * 1024

/** Anexo enviado com o prompt (`data:` URI com o conteúdo em base64). */
export interface PromptFile {
    name: string
    uri: string
}

/** Anexos que cabem nos limites (cada um e o total), na ordem da tarefa. Módulo puro o bastante para testar. */
export function pickAttachments<T extends { size: number }>(items: readonly T[], perFileMb = ADVERSARIAL_FILE_MB_MAX, totalMb = ADVERSARIAL_FILES_TOTAL_MB): T[] {
    const picked: T[] = []
    let total = 0
    for (const item of items) {
        if (item.size <= 0 || item.size > perFileMb * MB || total + item.size > totalMb * MB) continue
        picked.push(item)
        total += item.size
    }
    return picked
}

/** Anexos confirmados da tarefa (como o dono os vê). Melhor esforço: falha vira lista vazia. */
export async function listTaskAttachments(taskId: string): Promise<TaskAttachmentDto[]> {
    try {
        return (await listAttachments(ownerAttachmentActor(), { taskId })).attachments
    } catch (error) {
        log.warn({ err: error, taskId }, "[adversarial] anexos indisponíveis: seguem sem a lista")
        return []
    }
}

async function readAll(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<Buffer> {
    const reader = body.getReader()
    const chunks: Uint8Array[] = []
    try {
        while (true) {
            if (signal.aborted) throw new Error("Interrompido")
            const { done, value } = await reader.read()
            if (done) break
            if (value) chunks.push(value)
        }
    } finally {
        reader.releaseLock()
    }
    return Buffer.concat(chunks)
}

/**
 * Anexos da tarefa como arquivos do prompt (modo "Nomes e arquivos"). Melhor esforço: anexo que não
 * baixa fica só com o nome na lista do contexto.
 */
export async function loadPromptFiles(attachments: readonly TaskAttachmentDto[], signal: AbortSignal): Promise<PromptFile[]> {
    const actor = ownerAttachmentActor()
    const files: PromptFile[] = []
    for (const attachment of pickAttachments(attachments)) {
        if (signal.aborted) break
        try {
            const content = await readAttachmentContent(actor, attachment.id, { download: true })
            if (!content.body) continue
            const mime = attachment.mimeType || content.contentType || "application/octet-stream"
            files.push({ name: attachment.name, uri: `data:${mime};base64,${(await readAll(content.body, signal)).toString("base64")}` })
        } catch (error) {
            log.warn({ err: error, attachmentId: attachment.id }, "[adversarial] anexo não baixado: segue só com o nome")
        }
    }
    return files
}
