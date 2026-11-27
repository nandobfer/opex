import { remapSlug, type ChannelMapEntry } from "../../channel-migration/plan"

/**
 * Passo "Dados do Opex no Mongo" da migração B (OPE-206): troca, pelo mapa, todo slug de canal gerenciado guardado no
 * banco desta instância. Canais escolhidos pelo usuário não estão no mapa e ficam como estão. Idempotente: rodar de
 * novo não muda nada (os slugs já trocados não estão mais na origem do mapa).
 *
 * - agentes rotineiros: canais base, extras e bloqueados do provisionamento;
 * - entradas dos rotineiros (`routine_entries.channel`);
 * - avisos do Secretário (`secretary_notices.memoryChannel`);
 * - caches do Engramind: similares (`channel`), entregas (`channels`/`delivered`) e contexto (`channels`/`delivered` e
 *   a chave, recalculada com `contextCacheKey`, para a reserva com o Engramind fora do ar continuar valendo);
 * - o layout dos universos (qualquer texto igual a um canal do mapa).
 * A fila de gravações pendentes guarda a lista (não o canal) e é refeita no canal certo ao ser reprocessada.
 */

type MapLike = readonly Pick<ChannelMapEntry, "from" | "to">[]

const remapAll = (values: readonly string[] | null | undefined, map: MapLike) => (values ?? []).map((value) => remapSlug(value, map))
const changed = (a: readonly string[] | null | undefined, b: readonly string[]) => (a ?? []).some((value, index) => value !== b[index])

/** Troca, em qualquer profundidade, os textos iguais a um canal do mapa (puro). */
export function remapDeep(value: unknown, map: MapLike): unknown {
    if (typeof value === "string") return remapSlug(value, map)
    if (Array.isArray(value)) return value.map((item) => remapDeep(item, map))
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [remapSlug(key, map), remapDeep(item, map)]))
    return value
}

export async function rewriteStoredSlugs(map: MapLike): Promise<Record<string, number>> {
    const counts: Record<string, number> = { rotineiros: 0, entradas: 0, avisos: 0, similares: 0, entregas: 0, contexto: 0, layout: 0 }
    if (!map.length) return counts
    const { dbConnect } = await import("@/lib/db")
    await dbConnect()

    const { RoutineAgent, RoutineEntry } = await import("@/lib/db/models/RoutineAgent")
    const agents = await RoutineAgent.find({}).select({ provisioning: 1 }).lean<{ _id: unknown; provisioning?: { channels?: string[]; extras?: { channel: string }[]; blocked?: { channel: string }[] } | null }[]>()
    for (const agent of agents) {
        const provisioning = agent.provisioning
        if (!provisioning) continue
        const channels = remapAll(provisioning.channels, map)
        const extras = (provisioning.extras ?? []).map((item) => ({ ...item, channel: remapSlug(item.channel, map) }))
        const blocked = (provisioning.blocked ?? []).map((item) => ({ ...item, channel: remapSlug(item.channel, map) }))
        const touched = changed(provisioning.channels, channels) || extras.some((item, index) => item.channel !== provisioning.extras?.[index]?.channel) || blocked.some((item, index) => item.channel !== provisioning.blocked?.[index]?.channel)
        if (!touched) continue
        await RoutineAgent.updateOne({ _id: agent._id }, { $set: { "provisioning.channels": channels, "provisioning.extras": extras, "provisioning.blocked": blocked } }, { timestamps: false })
        counts.rotineiros++
    }

    const { SecretaryNotice } = await import("@/features/secretary-agent/server/models")
    const { EngramindContextCache, EngramindDelivery, EngramindRelatedMemory, EngramindState, ENGRAMIND_STATE_ID, engramindDb } = await import("../models")
    await engramindDb()
    for (const entry of map) {
        counts.entradas += (await RoutineEntry.updateMany({ channel: entry.from }, { $set: { channel: entry.to } })).modifiedCount
        counts.avisos += (await SecretaryNotice.updateMany({ memoryChannel: entry.from }, { $set: { memoryChannel: entry.to } })).modifiedCount
        counts.similares += (await EngramindRelatedMemory.updateMany({ channel: entry.from }, { $set: { channel: entry.to } })).modifiedCount
    }

    const froms = map.map((entry) => entry.from)
    const deliveries = await EngramindDelivery.find({ $or: [{ channels: { $in: froms } }, { delivered: { $in: froms } }] }).lean()
    for (const delivery of deliveries) {
        await EngramindDelivery.updateOne({ _id: delivery._id }, { $set: { channels: remapAll(delivery.channels, map), delivered: remapAll(delivery.delivered, map) } })
        counts.entregas++
    }

    const { contextCacheKey } = await import("../memory-context")
    const caches = await EngramindContextCache.find({ channels: { $in: froms } }).lean()
    for (const cache of caches) {
        const channels = remapAll(cache.channels, map)
        const _id = contextCacheKey(cache.consumer as Parameters<typeof contextCacheKey>[0], channels)
        const { _id: oldId, ...rest } = cache
        await EngramindContextCache.updateOne({ _id }, { $set: { ...rest, channels, delivered: remapAll(cache.delivered, map) } }, { upsert: true })
        if (oldId !== _id) await EngramindContextCache.deleteOne({ _id: oldId })
        counts.contexto++
    }

    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ universeLayout: 1 }).lean()
    if (state?.universeLayout?.config) {
        const config = remapDeep(state.universeLayout.config, map) as Record<string, unknown>
        if (JSON.stringify(config) !== JSON.stringify(state.universeLayout.config)) {
            await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { "universeLayout.config": config } })
            counts.layout = 1
        }
    }
    return counts
}
