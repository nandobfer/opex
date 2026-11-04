import type { ProviderUsageRow, ProviderUsageTotals, UsageQuery } from "./provider-usage"
import { usageQuerySchema, usageRangeQuery } from "./provider-usage"

export {
    AI_CONSUMPTION_ORIGIN_LABELS,
    aiConsumptionOriginLabel,
    formatTokens,
    formatTokensCompact,
    formatUsd,
    isUsageProviderId,
    USAGE_PROVIDER_IDS,
    usageQuerySchema,
    usageRangeQuery,
} from "./provider-usage"

export const opencodeUsageQuerySchema = usageQuerySchema
export type OpencodeUsageQuery = UsageQuery
export const opencodeUsageRangeQuery = usageRangeQuery

/** Uma linha do painel: consumo de uma origem (feature, refinamento ou mesa) no período. */
export interface OpencodeUsageOriginRow extends Omit<ProviderUsageRow, "key"> {
    origin: string
}

export interface OpencodeUsageSummary {
    origins: OpencodeUsageOriginRow[]
    total: ProviderUsageTotals
    /** Início da cobertura: instante do registro mais antigo, independente do período. */
    coverageFrom: string | null
    /** Registros do período sem tokens totais (0 = medição completa). */
    missingTokenRequests: number
    /** Registros do período sem custo (0 = medição completa). */
    missingCostRequests: number
}
