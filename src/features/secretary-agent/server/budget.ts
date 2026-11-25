import { AiConsumption } from "@/lib/db/models/AiConsumption"
import { AiUsageLog } from "@/lib/db/models/Ai"
import { SECRETARY_BUDGET_ORIGINS, SECRETARY_DECISION_CONSUMPTION_ORIGIN } from "../constants"
import { startOfDayIn } from "../limits"

/**
 * Gasto de hoje (fuso de São Paulo) que conta no orçamento diário: as respostas e a decisão do assunto, por modelo de
 * texto (`ai_consumption_logs`) ou pelo JEV (`ai_usage_logs`, feature `secretary-decision`). A análise e a simulação
 * ficam de fora.
 */
export async function spentTodayUsd(now: Date): Promise<number> {
    const since = startOfDayIn(now)
    const [text, jev] = await Promise.all([
        AiConsumption.aggregate<{ total: number }>([{ $match: { origin: { $in: [...SECRETARY_BUDGET_ORIGINS] }, createdAt: { $gte: since } } }, { $group: { _id: null, total: { $sum: "$costUsd" } } }]),
        AiUsageLog.aggregate<{ total: number }>([{ $match: { provider: "jev", feature: SECRETARY_DECISION_CONSUMPTION_ORIGIN, createdAt: { $gte: since } } }, { $group: { _id: null, total: { $sum: "$costUsd" } } }]),
    ])
    return (text[0]?.total ?? 0) + (jev[0]?.total ?? 0)
}
