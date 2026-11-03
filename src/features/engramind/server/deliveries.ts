import { EngramindDelivery, engramindDb, type IEngramindDelivery } from "./models"
import { engramindLog } from "./shared"

/**
 * Rastreio por turno (OPE-117): a última entrega do contexto de cada consumidor (ids por faixa,
 * canais, `version`, modo do foco). Nunca guarda texto de memória nem o foco. Gravação fora do caminho
 * do turno: **nunca lança** (falha vira aviso no log).
 */

export interface DeliveryInput {
    fullIds: readonly string[]
    titleIds: readonly string[]
    counts: { full: number; titles: number; overflow: number }
    channels: readonly string[]
    delivered: readonly string[]
    version: string
    focusMode: IEngramindDelivery["focusMode"]
    source: IEngramindDelivery["source"]
}

export interface DeliveryDto {
    consumer: string
    fullIds: string[]
    titleIds: string[]
    overflow: number
    counts: { full: number; titles: number; overflow: number }
    channels: string[]
    delivered: string[]
    version: string
    focusMode: IEngramindDelivery["focusMode"]
    source: IEngramindDelivery["source"]
    at: string
}

export async function recordDelivery(consumer: string, input: DeliveryInput, at = new Date()): Promise<void> {
    try {
        await engramindDb()
        await EngramindDelivery.updateOne(
            { _id: consumer },
            {
                $set: {
                    fullIds: [...new Set(input.fullIds)],
                    titleIds: [...new Set(input.titleIds)],
                    overflow: input.counts.overflow,
                    counts: input.counts,
                    channels: [...input.channels],
                    delivered: [...new Set(input.delivered)],
                    version: input.version,
                    focusMode: input.focusMode,
                    source: input.source,
                    at,
                },
            },
            { upsert: true },
        )
    } catch (error) {
        engramindLog.warn({ err: error instanceof Error ? error.message : String(error), consumer }, "[engramind] última entrega do contexto não registrada")
    }
}

export const toDeliveryDto = (row: IEngramindDelivery): DeliveryDto => ({
    consumer: row._id,
    fullIds: row.fullIds ?? [],
    titleIds: row.titleIds ?? [],
    overflow: row.overflow ?? 0,
    counts: row.counts ?? { full: 0, titles: 0, overflow: 0 },
    channels: row.channels ?? [],
    delivered: row.delivered ?? [],
    version: row.version ?? "",
    focusMode: row.focusMode ?? null,
    source: row.source ?? "live",
    at: new Date(row.at).toISOString(),
})

export async function listDeliveries(): Promise<DeliveryDto[]> {
    await engramindDb()
    const rows = await EngramindDelivery.find({}).lean<IEngramindDelivery[]>()
    return rows.map(toDeliveryDto)
}
