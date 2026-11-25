import { AiConsumption } from "@/lib/db/models/AiConsumption"
import { AiUsageLog } from "@/lib/db/models/Ai"

/** Custo (US$) gravado com um assunto: chamadas de texto (`ai_consumption_logs`) mais o JEV (`AiUsageLog`). */
export async function costBySubject(subject: string): Promise<number> {
    const [text, jev] = await Promise.all([
        AiConsumption.aggregate<{ total: number }>([{ $match: { subject } }, { $group: { _id: null, total: { $sum: "$costUsd" } } }]),
        AiUsageLog.aggregate<{ total: number }>([{ $match: { provider: "jev", subject } }, { $group: { _id: null, total: { $sum: "$costUsd" } } }]),
    ])
    return (text[0]?.total ?? 0) + (jev[0]?.total ?? 0)
}
