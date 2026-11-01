import { model, models, Schema, type Model } from "mongoose"
import { engramindDb } from "./models"

/**
 * Último consumo de cada memória pelos agentes do Opex (OPE-109). O Engramind só expõe
 * `last_retrieved_at` (busca) e guarda `last_injected_at` internamente; sem este registro, as memórias
 * que só entram pelo contexto pareceriam esquecidas na rede. Gravado junto com o evento
 * `engramind-consumption`; nunca guarda texto.
 */

export interface IEngramindMemoryUsage {
    _id: string
    lastUsedAt: Date
    /** Consumos vistos pelo Opex (contexto + busca). */
    liveCount: number
}

const usageSchema = new Schema<IEngramindMemoryUsage>(
    { _id: { type: String, required: true }, lastUsedAt: { type: Date, required: true }, liveCount: { type: Number, default: 0 } },
    { collection: "engramind_memory_usage", versionKey: false },
)
/** Memória sem uso há um ano (ou excluída no Engramind) sai sozinha. */
usageSchema.index({ lastUsedAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600, name: "last_used_ttl" })

export const EngramindMemoryUsage: Model<IEngramindMemoryUsage> =
    (models.EngramindMemoryUsage as Model<IEngramindMemoryUsage>) ?? model<IEngramindMemoryUsage>("EngramindMemoryUsage", usageSchema)

export interface MemoryUsageDto {
    lastUsedAt: string
    liveCount: number
}

export async function recordMemoryUsage(ids: readonly string[], at: Date = new Date()): Promise<void> {
    const unique = [...new Set(ids)]
    if (!unique.length) return
    await engramindDb()
    await EngramindMemoryUsage.bulkWrite(
        unique.map((id) => ({ updateOne: { filter: { _id: id }, update: { $max: { lastUsedAt: at }, $inc: { liveCount: 1 } }, upsert: true } })),
        { ordered: false },
    )
}

export async function listMemoryUsage(): Promise<Record<string, MemoryUsageDto>> {
    await engramindDb()
    const rows = await EngramindMemoryUsage.find({}).lean()
    return Object.fromEntries(rows.map((row) => [row._id, { lastUsedAt: new Date(row.lastUsedAt).toISOString(), liveCount: row.liveCount ?? 0 }]))
}
