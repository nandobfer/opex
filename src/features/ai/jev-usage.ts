import { usageQuerySchema, usageRangeQuery } from "./provider-usage"

export const jevUsageQuerySchema = usageQuerySchema
export type JevUsageQuery = ReturnType<typeof usageQuerySchema.parse>
export const jevUsageRangeQuery = usageRangeQuery

/** Consumo de uma feature de IA no período. Métricas ausentes ficam `null`. */
export interface JevUsageFeatureRow {
    feature: string
    label: string
    requests: number
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    costUsd: number | null
}

export interface JevUsageSummary {
    requests: number
    failedRequests: number
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    costUsd: number | null
    reconstructedRequests: number
    missingTokenRequests: number
    missingCostRequests: number
    /** Uma linha por recurso que consumiu o JEV no período, do maior custo para o menor. */
    features: JevUsageFeatureRow[]
}

export { formatUsd as formatJevCost } from "./provider-usage"
