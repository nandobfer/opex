import { kpi, type MetricsContext } from "@/features/agent-metrics/server/context"
import type { AgentMetricsPart } from "@/features/agent-metrics/types"
import { AiConsumption } from "@/lib/db/models/AiConsumption"
import { AiUsageLog } from "@/lib/db/models/Ai"
import { SECRETARY_BUDGET_ORIGINS, SECRETARY_ANALYSIS_CONSUMPTION_ORIGIN, SECRETARY_DECISION_CONSUMPTION_ORIGIN } from "../constants"
import { SecretaryDecisionRecord, secretaryDb } from "./models"

export async function secretaryMetrics(ctx: MetricsContext): Promise<AgentMetricsPart> {
    await secretaryDb()
    const { from, to } = ctx.range
    const createdAt = { $gte: from, $lte: to }
    const [docs, costs, jevCosts] = await Promise.all([
        SecretaryDecisionRecord.find({ at: { $gte: from, $lte: to } }).select("decision topic chatId instance").lean(),
        AiConsumption.aggregate<{ cost: number }>([{ $match: { origin: { $in: [...SECRETARY_BUDGET_ORIGINS, SECRETARY_ANALYSIS_CONSUMPTION_ORIGIN] }, createdAt } }, { $group: { _id: null, cost: { $sum: "$costUsd" } } }]),
        AiUsageLog.aggregate<{ cost: number }>([{ $match: { provider: "jev", feature: SECRETARY_DECISION_CONSUMPTION_ORIGIN, createdAt } }, { $group: { _id: null, cost: { $sum: "$costUsd" } } }]),
    ])
    const replies = docs.filter((doc) => doc.decision === "replied" || doc.decision === "asked-owner")
    const topics = new Map<string, number>()
    for (const doc of docs) if (doc.topic) topics.set(doc.topic, (topics.get(doc.topic) ?? 0) + 1)
    return { baseCount: docs.length, baseLabel: "Mensagens avaliadas", emptyReason: "Nenhuma mensagem avaliada no período.",
        kpis: [kpi("replies", "Respostas", replies.length, "count", "Turnos com envio"), kpi("chats", "Conversas atendidas", new Set(replies.map((doc) => `${doc.instance}:${doc.chatId}`)).size, "count", "Conversas distintas com envio"),
            kpi("pauses", "Pausas", docs.filter((doc) => doc.decision === "paused").length, "count", "Pausas registradas"), kpi("questions", "Perguntas ao dono", docs.filter((doc) => doc.decision === "asked-owner").length, "count", "Perguntas encaminhadas"),
            kpi("secretary-cost", "Custo (US$)", (costs[0]?.cost ?? 0) + (jevCosts[0]?.cost ?? 0), "usd", "Custo real ou estimado")],
        lines: [],
        bars: [{ id: "topics", title: "Assuntos mais frequentes", description: "Assunto classificado pela IA nas mensagens avaliadas com critério de assunto.", format: "count",
            items: [...topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([topic, count]) => ({ key: topic, label: topic, value: count })) }],
        notices: [],
    }
}
