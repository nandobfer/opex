import { AgentMetricTracking } from "@/lib/db/models/AgentMetrics"
import { TRACKING_KEYS } from "@/features/agent-metrics/constants"

/**
 * Marca desde quando cada fato não retroativo das métricas dos agentes é registrado (OPE-122). Usa
 * `$setOnInsert`: a primeira subida grava a data e as próximas não mudam nada (idempotente). As
 * métricas que dependem desses fatos mostram "Dados desde dd/mm/aaaa".
 */
export async function startAgentMetricsTracking(now: Date = new Date()): Promise<void> {
    await AgentMetricTracking.bulkWrite(
        TRACKING_KEYS.map((type) => ({ updateOne: { filter: { type }, update: { $setOnInsert: { type, since: now } }, upsert: true } })),
        { ordered: false },
    )
}
