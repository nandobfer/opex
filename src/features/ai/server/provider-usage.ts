import { dbConnect } from "@/lib/db"
import { AiConsumption } from "@/lib/db/models/AiConsumption"
import {
    aiConsumptionOriginLabel,
    type ProviderUsageRow,
    type ProviderUsageSummary,
    type UsageQuery,
} from "../provider-usage"

const missing = (field: string) => ({ $eq: [{ $ifNull: [`$${field}`, null] }, null] })
const countMissing = (field: string) => ({ $sum: { $cond: [missing(field), 1, 0] } })

interface GroupRow {
    _id: string
    requests: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd: number
    missingInput: number
    missingOutput: number
    missingTotal: number
    missingCost: number
}

/** Métrica desconhecida quando todos os registros do recurso não a informam; senão a soma dos informados. */
const metric = (sum: number, missingCount: number, requests: number): number | null =>
    requests > 0 && missingCount === requests ? null : sum

/** Soma entre recursos: `null` só quando nenhum deles tem o valor. */
function sumOrNull(values: (number | null)[]): number | null {
    const known = values.filter((value): value is number => value !== null)
    return known.length === 0 ? null : known.reduce((total, value) => total + value, 0)
}

/**
 * Consumo de um provedor por recurso (feature ou agente), restrito ao período. Usa apenas
 * `ai_consumption_logs` (medição prospectiva) — não soma os acumuladores legados, para não duplicar.
 * `coverageFrom` mostra desde quando há medição daquele provedor.
 */
export async function getProviderUsage(provider: string, query: UsageQuery): Promise<ProviderUsageSummary> {
    await dbConnect()
    const filter = {
        provider,
        ...(query.from || query.to
            ? {
                  createdAt: {
                      ...(query.from ? { $gte: new Date(query.from) } : {}),
                      ...(query.to ? { $lte: new Date(query.to) } : {}),
                  },
              }
            : {}),
    }
    const [rows, first] = await Promise.all([
        AiConsumption.aggregate<GroupRow>([
            { $match: filter },
            {
                $group: {
                    _id: "$origin",
                    requests: { $sum: 1 },
                    inputTokens: { $sum: "$inputTokens" },
                    outputTokens: { $sum: "$outputTokens" },
                    totalTokens: { $sum: "$totalTokens" },
                    costUsd: { $sum: "$costUsd" },
                    missingInput: countMissing("inputTokens"),
                    missingOutput: countMissing("outputTokens"),
                    missingTotal: countMissing("totalTokens"),
                    missingCost: countMissing("costUsd"),
                },
            },
            { $sort: { costUsd: -1, requests: -1 } },
        ]),
        AiConsumption.findOne({ provider }).sort({ createdAt: 1 }).select({ createdAt: 1 }).lean(),
    ])

    const resources: ProviderUsageRow[] = rows.map((row) => ({
        key: row._id,
        label: aiConsumptionOriginLabel(row._id),
        requests: row.requests,
        inputTokens: metric(row.inputTokens, row.missingInput, row.requests),
        outputTokens: metric(row.outputTokens, row.missingOutput, row.requests),
        totalTokens: metric(row.totalTokens, row.missingTotal, row.requests),
        costUsd: metric(row.costUsd, row.missingCost, row.requests),
    }))

    return {
        rows: resources,
        total: {
            requests: resources.reduce((sum, row) => sum + row.requests, 0),
            inputTokens: sumOrNull(resources.map((row) => row.inputTokens)),
            outputTokens: sumOrNull(resources.map((row) => row.outputTokens)),
            totalTokens: sumOrNull(resources.map((row) => row.totalTokens)),
            costUsd: sumOrNull(resources.map((row) => row.costUsd)),
        },
        coverageFrom: first ? new Date(first.createdAt).toISOString() : null,
        missingTokenRequests: rows.reduce((sum, row) => sum + row.missingTotal, 0),
        missingCostRequests: rows.reduce((sum, row) => sum + row.missingCost, 0),
    }
}
