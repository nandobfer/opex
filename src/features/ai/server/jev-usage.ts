import { dbConnect } from "@/lib/db"
import { AiUsageLog } from "@/lib/db/models/Ai"
import type { JevUsageQuery, JevUsageSummary } from "../jev-usage"

const missing = (field: string) => ({ $eq: [{ $ifNull: [`$${field}`, null] }, null] })
const countMissing = (field: string) => ({ $sum: { $cond: [missing(field), 1, 0] } })

/** Agrega apenas logs JEV retidos; métricas desconhecidas não viram zeros medidos. */
export async function getJevUsage(query: JevUsageQuery): Promise<JevUsageSummary> {
    await dbConnect()
    const filter = {
        provider: "jev",
        ...(query.from || query.to ? { createdAt: {
            ...(query.from ? { $gte: new Date(query.from) } : {}),
            ...(query.to ? { $lte: new Date(query.to) } : {}),
        } } : {}),
    }
    const [summary] = await AiUsageLog.aggregate<JevUsageSummary & { missingInput: number; missingOutput: number }>([
        { $match: filter },
        { $group: {
            _id: null,
            requests: { $sum: 1 },
            failedRequests: { $sum: { $cond: [{ $eq: ["$ok", false] }, 1, 0] } },
            inputTokens: { $sum: "$inputTokens" },
            outputTokens: { $sum: "$outputTokens" },
            totalTokens: { $sum: "$totalTokens" },
            costUsd: { $sum: "$costUsd" },
            reconstructedRequests: { $sum: { $cond: [{ $eq: ["$usageSource", "historical-allocation"] }, 1, 0] } },
            missingInput: countMissing("inputTokens"),
            missingOutput: countMissing("outputTokens"),
            missingTokenRequests: countMissing("totalTokens"),
            missingCostRequests: countMissing("costUsd"),
        } },
    ])
    return {
        requests: summary?.requests ?? 0,
        failedRequests: summary?.failedRequests ?? 0,
        inputTokens: !summary ? 0 : summary.missingInput === summary.requests ? null : summary.inputTokens,
        outputTokens: !summary ? 0 : summary.missingOutput === summary.requests ? null : summary.outputTokens,
        totalTokens: !summary ? 0 : summary.missingTokenRequests === summary.requests ? null : summary.totalTokens,
        costUsd: !summary ? 0 : summary.missingCostRequests === summary.requests ? null : summary.costUsd,
        reconstructedRequests: summary?.reconstructedRequests ?? 0,
        missingTokenRequests: summary?.missingTokenRequests ?? 0,
        missingCostRequests: summary?.missingCostRequests ?? 0,
    }
}
