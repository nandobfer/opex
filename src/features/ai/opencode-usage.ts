import type { ProviderUsageSummary, UsageQuery } from "./provider-usage"
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

/**
 * Consumo do OpenCode por origem (feature, refinamento ou mesa). Mesma forma do painel dos
 * provedores diretos (`rows` com `key`), para o card compartilhado ler um contrato só.
 */
export type OpencodeUsageSummary = ProviderUsageSummary
