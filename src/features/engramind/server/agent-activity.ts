import { MEMORY_CONSUMERS, MEMORY_IDENTITIES, type MemoryIdentity } from "@/features/ai/agents"
import { AI_MEMORY_AUDIT_ENTITY } from "@/features/ai/constants"
import { isAdoptionStale, windowStart, type AgentActivityDto } from "../agent-activity"
import { listDeliveries } from "./deliveries"
import { engramindLog } from "./shared"

/**
 * Adoção por agente (OPE-117): gravações do próprio agente na auditoria do Opex (total, 7 dias, última),
 * a última entrega do contexto e o aviso de 14 dias. Nunca lança: uma fonte com erro vira zero/nulo.
 */

const actorOf = (agent: MemoryIdentity) => `agente:${agent}`

interface WriteStats {
    total: number
    last7d: number
    lastWriteAt: Date | null
}

async function writeStats(now: Date): Promise<Map<string, WriteStats>> {
    const { dbConnect } = await import("@/lib/db")
    const { AuditLog } = await import("@/lib/db/models/AuditLog")
    await dbConnect()
    const since = windowStart(now)
    const rows = await AuditLog.aggregate<{ _id: string; total: number; last7d: number; lastWriteAt: Date | null }>([
        { $match: { entidade: AI_MEMORY_AUDIT_ENTITY, "dadosNovos.ator": { $in: MEMORY_IDENTITIES.map(actorOf) } } },
        { $group: { _id: "$dadosNovos.ator", total: { $sum: 1 }, last7d: { $sum: { $cond: [{ $gte: ["$timestamp", since] }, 1, 0] } }, lastWriteAt: { $max: "$timestamp" } } },
    ])
    return new Map(rows.map((row) => [row._id, { total: row.total, last7d: row.last7d, lastWriteAt: row.lastWriteAt ?? null }]))
}

/** Criação dos agentes do Opex no Engramind (aviso de "nunca gravou"); sem conexão, a data do token. */
async function agentCreatedAt(): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    try {
        const { EngramindState, ENGRAMIND_STATE_ID, engramindDb } = await import("./models")
        await engramindDb()
        const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ agentTokens: 1 }).lean()
        for (const [agent, token] of Object.entries(state?.agentTokens ?? {})) if (token?.issuedAt) out.set(agent, new Date(token.issuedAt).toISOString())
    } catch {
        // Sem estado: o aviso de "nunca gravou" não acende.
    }
    try {
        const { engramindCall } = await import("./client")
        const { OPEX_APP_SLUG } = await import("../constants")
        const list = await engramindCall<{ agents?: { slug: string; created_at: string }[] }>("GET", { path: "/v1/agents", query: { app: OPEX_APP_SLUG, limit: 200 } }, { timeoutMs: 3_000 })
        for (const agent of list?.agents ?? []) out.set(agent.slug, agent.created_at)
    } catch {
        // Engramind fora do ar: fica a data do token.
    }
    return out
}

export async function listAgentActivity(now = new Date()): Promise<AgentActivityDto[]> {
    const [stats, deliveries, created, settings] = await Promise.all([
        writeStats(now).catch((error: unknown) => {
            engramindLog.warn({ err: error instanceof Error ? error.message : String(error) }, "[engramind] adoção: auditoria das memórias indisponível")
            return new Map<string, WriteStats>()
        }),
        listDeliveries().catch(() => []),
        agentCreatedAt(),
        import("@/features/ai/server/self-memory/settings")
            .then(({ getSelfMemorySettings }) => getSelfMemorySettings())
            .then((result) => result.settings)
            .catch(() => null),
    ])
    const byConsumer = new Map(deliveries.map((row) => [row.consumer, row]))
    return MEMORY_IDENTITIES.map((agent) => {
        const stat = stats.get(actorOf(agent)) ?? { total: 0, last7d: 0, lastWriteAt: null }
        const isConsumer = (MEMORY_CONSUMERS as readonly string[]).includes(agent)
        const selfMemory = isConsumer && settings ? Boolean(settings[agent as keyof typeof settings]) : null
        const delivery = byConsumer.get(agent)
        const lastWriteAt = stat.lastWriteAt ? new Date(stat.lastWriteAt).toISOString() : null
        return {
            agent,
            total: stat.total,
            last7d: stat.last7d,
            lastWriteAt,
            delivery: delivery ? { fullIds: delivery.fullIds, titleIds: delivery.titleIds, overflow: delivery.overflow, counts: delivery.counts, channels: delivery.channels, delivered: delivery.delivered, version: delivery.version, focusMode: delivery.focusMode, source: delivery.source, at: delivery.at } : null,
            selfMemory,
            stale: isAdoptionStale({ selfMemory, lastWriteAt, agentCreatedAt: created.get(agent) ?? null }, now),
        }
    })
}
