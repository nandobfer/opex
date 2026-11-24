import mongoose from "mongoose"
import { chatFileKind, type ChatFileKind } from "@/lib/chat-files/kind"
import { AgenticFile, AgenticFork, type IAgenticWorkbench } from "@/lib/db/models/Agentic"
import { logger } from "@/lib/logger"
import { AGENTIC_FILE_LINK_TTL_SECONDS } from "../../files"
import type { CentralConfig } from "../../schemas"

/**
 * Dados da mesa lidos para o agente (OPE-178): anexos (da mesa, dos forks e da página da tarefa), a
 * tarefa completa e o link/conteúdo de um anexo, sempre gerados NA HORA (nada herdado de um turno
 * anterior). Usado pelo MCP `opex_mesa` e pelo pacote de degradação no prompt.
 */

export interface WorkbenchAttachment {
    id: string
    name: string
    mediaType: string
    size: number
    kind: ChatFileKind
    /** `workbench` = enviado na mesa ou num fork; `task` = anexo da página da tarefa. */
    source: "workbench" | "task"
    /** Rótulo legível da origem ("Mesa", "Fork 2", "Tarefa"). */
    origin: string
    key: string
    createdAt: string | null
}

/** O banco está conectado? (o turno nunca espera a conexão por causa do contexto). */
export const dbReady = () => mongoose.connection.readyState === 1

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : typeof value === "string" ? value : null)

/** Anexos da mesa (mesa e forks) e da tarefa, mais antigos primeiro. */
export async function listWorkbenchAttachments(workbench: Pick<IAgenticWorkbench, "_id" | "taskId">): Promise<WorkbenchAttachment[]> {
    const workbenchId = String(workbench._id)
    const { TaskAttachment } = await import("@/lib/db/models/TaskAttachment")
    const [files, forks, taskFiles] = await Promise.all([
        AgenticFile.find({ workbenchId, ready: true }).sort({ createdAt: 1 }).lean(),
        AgenticFork.find({ workbenchId }).select({ number: 1 }).lean<{ _id: unknown; number: number }[]>(),
        TaskAttachment.find({ taskId: workbench.taskId, status: "ready" }).sort({ createdAt: 1 }).lean(),
    ])
    const forkNumbers = new Map(forks.map((fork) => [String(fork._id), fork.number]))
    return [
        ...files.map((file) => {
            const forkNumber = file.forkId ? forkNumbers.get(file.forkId) : undefined
            return { id: String(file._id), name: file.name, mediaType: file.mediaType, size: file.size, kind: chatFileKind(file.mediaType, file.name), source: "workbench" as const, origin: file.forkId ? (forkNumber ? `Fork ${forkNumber}` : "Fork") : "Mesa", key: file.key, createdAt: iso(file.createdAt) }
        }),
        ...taskFiles.map((file) => ({ id: String((file as { _id: unknown })._id), name: file.name, mediaType: file.mimeType, size: file.size, kind: chatFileKind(file.mimeType, file.name), source: "task" as const, origin: "Tarefa", key: file.key, createdAt: iso(file.createdAt) })),
    ]
}

/** Contagem dos anexos para o cabeçalho (`null` sem banco ou com falha: o cabeçalho omite a linha). */
export async function countWorkbenchAttachments(workbench: Pick<IAgenticWorkbench, "_id" | "taskId">): Promise<{ workbench: number; task: number } | null> {
    if (!dbReady()) return null
    try {
        const { TaskAttachment } = await import("@/lib/db/models/TaskAttachment")
        const [mine, task] = await Promise.all([AgenticFile.countDocuments({ workbenchId: String(workbench._id), ready: true }), TaskAttachment.countDocuments({ taskId: workbench.taskId, status: "ready" })])
        return { workbench: mine, task }
    } catch (error) {
        logger.warn({ err: error instanceof Error ? error.message : error, workbenchId: String(workbench._id) }, "[agentic] não foi possível contar os anexos da mesa")
        return null
    }
}

/** Link assinado novo (24 h) ou o motivo de não haver. */
export async function attachmentLink(file: Pick<WorkbenchAttachment, "key" | "name">): Promise<{ url: string | null; reason: string | null }> {
    try {
        const { getFileUrl } = await import("@/lib/storage/s3")
        return { url: await getFileUrl(file.key, { downloadName: file.name, expiresIn: AGENTIC_FILE_LINK_TTL_SECONDS }), reason: null }
    } catch (error) {
        return { url: null, reason: `o Storage S3 não gerou o link (${error instanceof Error ? error.message : String(error)})` }
    }
}

/** Conteúdo do anexo (até `maxBytes`; acima disso, não baixa). */
export async function attachmentBytes(file: Pick<WorkbenchAttachment, "key" | "size">, maxBytes: number): Promise<{ bytes: Uint8Array | null; reason: string | null }> {
    if (file.size > maxBytes) return { bytes: null, reason: `o arquivo passa do limite de entrega direta (${Math.round(maxBytes / 1024)} KB)` }
    try {
        const { getFileObject } = await import("@/lib/storage/s3")
        const stored = await getFileObject(file.key)
        if (!stored.body) return { bytes: null, reason: "o Storage S3 devolveu o arquivo vazio" }
        return { bytes: new Uint8Array(await new Response(stored.body).arrayBuffer()), reason: null }
    } catch (error) {
        return { bytes: null, reason: `o Storage S3 não respondeu (${error instanceof Error ? error.message : String(error)})` }
    }
}

/** A tarefa inteira, como a recebe o planejador da mesa. */
export async function workbenchTaskMarkdown(taskId: string, config: Pick<CentralConfig, "include"> | null): Promise<string> {
    const [{ getTask }, { buildTaskContextPrompt }] = await Promise.all([import("@/features/tasks/server/service"), import("@/features/ai/task-context-prompt")])
    const task = await getTask(taskId)
    return buildTaskContextPrompt(task, { comments: config?.include.comments ?? true, history: config?.include.history ?? false, timeLogs: false }, { fullText: true })
}
