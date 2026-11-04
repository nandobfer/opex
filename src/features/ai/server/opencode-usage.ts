import type { OpencodeUsageQuery, OpencodeUsageSummary } from "../opencode-usage"
import { getProviderUsage } from "./provider-usage"

/**
 * Consumo do OpenCode por origem (feature de IA, refinamento ou mesa), restrito ao período.
 * Mesmo agregador e mesmo contrato (`rows`) do painel dos provedores diretos; `coverageFrom`
 * mostra desde quando há medição.
 */
export async function getOpencodeUsage(query: OpencodeUsageQuery): Promise<OpencodeUsageSummary> {
    return getProviderUsage("opencode", query)
}
