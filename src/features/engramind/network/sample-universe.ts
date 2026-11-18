import { stableHash } from "@engramind/client/react"
import type { MemoryUniverseProps, RelatedHit } from "@engramind/client/react"

/** Memória do universo (o tipo da lib, derivado das props do `MemoryUniverse`). */
export type SampleMemory = MemoryUniverseProps["memories"][number]

/** Agente do centro da prévia (universo do agente). */
export const SAMPLE_AGENT = "exemplo/agente"
/** Similares fictícias por memória: o mesmo limite do `similar` do Engramind (OPE-164). */
export const SAMPLE_RELATED_MAX = 3
/** Memórias por "assunto" fictício dentro de um canal (as similares saem do mesmo assunto). */
const SAMPLE_TOPIC_SIZE = 6

export const SAMPLE_UNIVERSE_LIMITS = { count: { min: 1, max: 500, default: 120 }, channels: { min: 1, max: 8, default: 3 } } as const
const DAY_MS = 86_400_000

/** Número estável em [0, 1) de uma chave (sem `Math.random()`: a mesma amostra em toda renderização). */
const unit = (key: string) => stableHash(key) / 2 ** 32

/**
 * Universo de exemplo da prévia da aba Visualização (OPE-142): `count` memórias em `channels` canais, com
 * datas espalhadas por ~1 ano, usos variados, algumas fixadas e inativas. Determinístico.
 */
export function buildSampleUniverse(count: number, channels: number): { memories: SampleMemory[]; channels: string[] } {
    const total = Math.min(SAMPLE_UNIVERSE_LIMITS.count.max, Math.max(SAMPLE_UNIVERSE_LIMITS.count.min, Math.round(count)))
    const slugs = Array.from({ length: Math.min(SAMPLE_UNIVERSE_LIMITS.channels.max, Math.max(SAMPLE_UNIVERSE_LIMITS.channels.min, Math.round(channels))) }, (_, index) => `exemplo/canal-${index + 1}`)
    const now = Date.now()
    const memories = Array.from({ length: total }, (_, index): SampleMemory => {
        const id = `exemplo-${index + 1}`
        const age = Math.floor(unit(`${id}:age`) * 365)
        const created = new Date(now - age * DAY_MS).toISOString()
        const uses = Math.floor(unit(`${id}:uses`) ** 3 * 60)
        const roll = unit(`${id}:status`)
        return {
            id,
            channel: slugs[Math.floor(unit(`${id}:channel`) * slugs.length)] ?? slugs[0]!,
            title: `Memória de exemplo ${index + 1}`,
            text: "Memória fictícia da prévia: nada aqui vem do Engramind.",
            category: "fact",
            status: roll > 0.95 ? "permanent" : roll < 0.05 ? "archived" : "active",
            version: 1,
            createdAt: created,
            updatedAt: new Date(new Date(created).getTime() + Math.floor(unit(`${id}:upd`) * 30) * DAY_MS).toISOString(),
            retrievals: uses,
            injections: Math.floor(uses / 2),
            lastRetrievedAt: uses > 0 ? new Date(now - Math.floor(unit(`${id}:last`) * 120) * DAY_MS).toISOString() : null,
            verifiedAt: null,
            stale: false,
            author: null,
            // Algumas escritas pelo agente de exemplo do centro: o "Link do agente às memórias que ele criou" aparece na prévia.
            authorAgent: unit(`${id}:author`) < 0.15 ? SAMPLE_AGENT : null,
        }
    })
    return { memories, channels: slugs }
}

/**
 * Similares fictícias da prévia (OPE-164), determinísticas: cada memória cai num "assunto" do seu canal (pelo
 * hash do id) e ganha até 3 similares do mesmo assunto e canal, nunca ela mesma, com nota estável. A prévia
 * mostra a aproximação e as arestas sem consultar o Engramind.
 */
export function buildSampleRelated(memories: readonly Pick<SampleMemory, "id" | "channel">[]): Map<string, RelatedHit[]> {
    const counts = new Map<string, number>()
    for (const memory of memories) counts.set(memory.channel, (counts.get(memory.channel) ?? 0) + 1)
    const groups = new Map<string, string[]>()
    for (const memory of memories) {
        const topics = Math.max(1, Math.round((counts.get(memory.channel) ?? 1) / SAMPLE_TOPIC_SIZE))
        const key = `${memory.channel}:${Math.floor(unit(`${memory.id}:topic`) * topics)}`
        groups.set(key, [...(groups.get(key) ?? []), memory.id])
    }
    const related = new Map<string, RelatedHit[]>()
    for (const members of groups.values()) {
        for (const id of members) {
            const hits = members
                .filter((other) => other !== id)
                .map((other) => ({ id: other, score: Math.round((0.7 + 0.28 * unit([id, other].sort().join("|"))) * 1000) / 1000 }))
                .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
                .slice(0, SAMPLE_RELATED_MAX)
            if (hits.length) related.set(id, hits)
        }
    }
    return related
}
