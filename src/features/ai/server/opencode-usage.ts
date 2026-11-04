import type { OpencodeUsageQuery, OpencodeUsageSummary } from "../opencode-usage"
import { getProviderUsage } from "./provider-usage"

/**
 * Consumo do OpenCode por origem (feature de IA, refinamento ou mesa), restrito ao período.
 * Delega ao agregador compartilhado dos provedores; `coverageFrom` mostra desde quando há medição.
 */
export async function getOpencodeUsage(query: OpencodeUsageQuery): Promise<OpencodeUsageSummary> {
    const summary = await getProviderUsage("opencode", query)
    return {
        origins: summary.rows.map(({ key, ...row }) => ({ origin: key, ...row })),
        total: summary.total,
        coverageFrom: summary.coverageFrom,
        missingTokenRequests: summary.missingTokenRequests,
        missingCostRequests: summary.missingCostRequests,
    }
}
