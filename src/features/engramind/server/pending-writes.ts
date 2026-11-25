
import { createHash } from "node:crypto"
import { Schema, model, models, type Model } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import type { AiAgentId } from "@/features/ai/agents"
import type { AgentMemoryWriteOptions, MemoryPatch } from "@/features/ai/server/agent-memory-service"

/**
 * Fila de pendências do Engramind (OPE-192, nos moldes do zaturno): quando o Engramind está fora do ar, a
 * gravação de memória de um agente vai para `engramind_pending_writes` e a rotina `engramind-pending-writes`
 * (agendador interno, 1 min) reprocessa. A chave (`_id`) é `canal:alvo`, então a mesma memória não entra duas
 * vezes. Só o que é preciso para refazer a chamada fica gravado (nunca token).
 */

export type PendingOp = { op: "create"; texto: string } | { op: "update"; memoryId: string; patch: MemoryPatch }

interface PendingWrite {
    _id: string
    list: AiAgentId
    options: Omit<AgentMemoryWriteOptions, "agent"> & { agent?: { consumer: string; label: string } }
    actorId: string
    write: PendingOp
    attempts: number
    lastError: string | null
    createdAt: Date
}

const schema = new Schema<PendingWrite>(
    {
        _id: String,
        list: String,
        options: Schema.Types.Mixed,
        actorId: String,
        write: Schema.Types.Mixed,
        attempts: { type: Number, default: 0 },
        lastError: { type: String, default: null },
        createdAt: Date,
    },
    { collection: "engramind_pending_writes", versionKey: false },
)
schema.index({ createdAt: 1 })

const PendingWrites = (models.EngramindPendingWrite as Model<PendingWrite> | undefined) ?? model<PendingWrite>("EngramindPendingWrite", schema)

const log = loggerFor({ feature: "engramind-pending-writes" })
export const PENDING_ID_PREFIX = "pendente:"

/** Engramind fora do ar ou inalcançável (só então a gravação vai para a fila). */
export function isEngramindUnavailable(error: unknown): boolean {
    if (!(error instanceof DomainError)) return false
    return error.code === "ENGRAMIND_UNREACHABLE" || error.code === "ENGRAMIND_PROXY_MASKED" || error.code === "ENGRAMIND_DATABASE_UNAVAILABLE" || error.code === "ENGRAMIND_REQUEST_TIMEOUT" || error.code === "ENGRAMIND_MIGRATIONS_PENDING"
}

export function pendingKey(channel: string, write: PendingOp): string {
    const target = write.op === "create" ? createHash("sha256").update(write.texto.trim()).digest("hex").slice(0, 16) : write.memoryId
    return `${channel}:${target}`
}

export async function enqueuePendingWrite(input: { channel: string; list: AiAgentId; options: AgentMemoryWriteOptions; actorId: string; write: PendingOp }): Promise<string> {
    await dbConnect()
    const key = pendingKey(input.channel, input.write)
    const { agent, ...options } = input.options
    await PendingWrites.updateOne(
        { _id: key },
        {
            $set: { list: input.list, options: { ...options, ...(agent ? { agent: { consumer: agent.consumer, label: agent.label } } : {}) }, actorId: input.actorId, write: input.write },
            $setOnInsert: { attempts: 0, lastError: null, createdAt: new Date() },
        },
        { upsert: true },
    )
    log.warn({ key, list: input.list, op: input.write.op }, "[engramind] Engramind fora do ar: gravação na fila de pendências")
    return `${PENDING_ID_PREFIX}${key}`
}

export interface FlushResult {
    done: number
    failed: number
    remaining: number
}

/** Reprocessa a fila (mais antigas primeiro). Para no primeiro sinal de Engramind ainda fora do ar. */
export async function flushPendingWrites(limit = 50): Promise<FlushResult> {
    await dbConnect()
    const rows = await PendingWrites.find().sort({ createdAt: 1 }).limit(limit).lean<PendingWrite[]>()
    const service = await import("@/features/ai/server/agent-memory-service")
    let done = 0
    let failed = 0
    for (const row of rows) {
        const options = row.options as AgentMemoryWriteOptions
        try {
            if (row.write.op === "create") await service.createAgentMemory(row.list, row.write.texto, row.actorId, options)
            else await service.updateAgentMemory(row.list, row.write.memoryId, row.write.patch, row.actorId, options)
            await PendingWrites.deleteOne({ _id: row._id })
            done += 1
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (isEngramindUnavailable(error)) {
                await PendingWrites.updateOne({ _id: row._id }, { $inc: { attempts: 1 }, $set: { lastError: message } })
                break
            }
            // Erro de regra (memória duplicada, removida, versão): não adianta repetir.
            log.warn({ key: row._id, err: error }, "[engramind] Pendência descartada: o Engramind recusou a gravação")
            await PendingWrites.deleteOne({ _id: row._id })
            failed += 1
        }
    }
    return { done, failed, remaining: await PendingWrites.countDocuments() }
}
