import { dbConnect } from "@/lib/db"
import { AgentMetricTracking, AgentRun, AgentUsageDay, type IAgentUsageDay } from "@/lib/db/models/AgentMetrics"
import { dayKey } from "@/lib/time/buckets"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { AGENT_IDS, type AgentId } from "../catalog"
import { AGENT_METRICS_UPDATED_EVENT, METRICS_TIME_ZONE } from "../constants"
import { syncConversations } from "./conversations"
import { COUNTED_RUN, reconcileExcludedRuns } from "./exclusions"
import { syncAgentRuns } from "./sync"

const log = loggerFor({ module: "agent-metrics" })

/** Marcador do backfill retroativo (primeira execução da rotina). */
export const AGENT_METRICS_BACKFILL_KEY = "backfill"
/** Janela que a rotina recalcula a cada execução (cobre atrasos e reprocessamentos). */
const ROLLING_DAYS = 3
const DAY_MS = 86_400_000

type UsageRow = Omit<IAgentUsageDay, "updatedAt">

/** Agrupa execuções por agente, dia (fuso fixo), cliente e repositório (função pura). */
export function rollupRuns(
    runs: readonly { agent: string; finishedAt: Date | string; clientId: string | null; projectId: string | null; ok: boolean; inputTokens: number | null; outputTokens: number | null; costUsd: number | null; durationMs: number | null }[],
    timeZone: string = METRICS_TIME_ZONE,
): UsageRow[] {
    const rows = new Map<string, UsageRow>()
    for (const run of runs) {
        const day = dayKey(new Date(run.finishedAt).getTime(), timeZone)
        const key = `${run.agent}|${day}|${run.clientId ?? ""}|${run.projectId ?? ""}`
        const row = rows.get(key) ?? { agent: run.agent, day, clientId: run.clientId, projectId: run.projectId, runs: 0, failures: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 0 }
        row.runs++
        if (!run.ok) row.failures++
        row.inputTokens += run.inputTokens ?? 0
        row.outputTokens += run.outputTokens ?? 0
        row.costUsd += run.costUsd ?? 0
        row.durationMs += run.durationMs ?? 0
        rows.set(key, row)
    }
    return [...rows.values()]
}

/** Recalcula os resumos diários a partir do dia de `from` (inclusive) até hoje. */
export async function rollupUsageDays(from: Date): Promise<number> {
    await dbConnect()
    const fromDay = dayKey(from.getTime(), METRICS_TIME_ZONE)
    const runs = await AgentRun.find({ finishedAt: { $gte: new Date(from.getTime() - DAY_MS) }, ...COUNTED_RUN })
        .select({ agent: 1, finishedAt: 1, clientId: 1, projectId: 1, ok: 1, inputTokens: 1, outputTokens: 1, costUsd: 1, durationMs: 1 })
        .lean()
    const rows = rollupRuns(runs).filter((row) => row.day >= fromDay)
    await AgentUsageDay.deleteMany({ day: { $gte: fromDay } })
    const now = new Date()
    for (let index = 0; index < rows.length; index += 500) await AgentUsageDay.insertMany(rows.slice(index, index + 500).map((row) => ({ ...row, updatedAt: now })), { ordered: false })
    return rows.length
}

/**
 * Rotina `agent-usage-daily` (agendador interno, a cada hora). Na primeira execução faz o backfill
 * retroativo (execuções e conversas desde o início e os resumos de todos os dias); depois sincroniza e
 * recalcula só os últimos dias. Avisa as telas (`agent-metrics-updated`).
 */
export async function runAgentMetricsRoutine(now: Date = new Date()): Promise<string> {
    await dbConnect()
    const backfilled = await AgentMetricTracking.findOne({ type: AGENT_METRICS_BACKFILL_KEY }).lean()
    const from = backfilled ? new Date(now.getTime() - ROLLING_DAYS * DAY_MS) : new Date(0)
    const runs = await syncAgentRuns(AGENT_IDS, from)
    const conversations = await syncConversations({ from })
    // Mesa excluída e tarefa arquivada saem das métricas: os dias dessas execuções são recalculados.
    const changedSince = await reconcileExcludedRuns()
    const rollupFrom = backfilled ? (changedSince && changedSince < from ? changedSince : from) : new Date(0)
    const days = await rollupUsageDays(rollupFrom)
    if (!backfilled) await AgentMetricTracking.updateOne({ type: AGENT_METRICS_BACKFILL_KEY }, { $setOnInsert: { type: AGENT_METRICS_BACKFILL_KEY, since: now } }, { upsert: true })
    await publishAppEvent(AGENT_METRICS_UPDATED_EVENT, { agents: AGENT_IDS }).catch(() => undefined)
    const message = `${backfilled ? "Atualizado" : "Histórico retroativo gerado"}: ${runs} execução(ões), ${conversations} conversa(s), ${days} resumo(s) diário(s)`
    log.info({ runs, conversations, days, backfill: !backfilled }, `[agent-metrics] ${message}`)
    return message
}

const lastFresh = new Map<AgentId, number>()
const FRESH_MS = 30_000

let backfillInFlight: Promise<unknown> | null = null

/** Para testes: esquece as sincronizações recentes e o backfill em andamento. */
export function resetFreshRunsForTests(): void {
    lastFresh.clear()
    backfillInFlight = null
}

/**
 * Antes de calcular a Visão geral: sincroniza as execuções recentes do agente (no máximo a cada 30 s
 * por agente), para o tempo real não depender da rotina horária. Se o backfill retroativo ainda não
 * rodou (logo após a subida, antes da primeira execução da rotina), roda-o agora, uma vez só, para
 * "Último uso" e "Uso por data" não começarem vazios. Também tira das métricas as execuções de mesa
 * excluída e de tarefa arquivada e recalcula os dias afetados.
 */
export async function ensureFreshRuns(agent: AgentId, now: number = Date.now()): Promise<void> {
    if (now - (lastFresh.get(agent) ?? 0) < FRESH_MS) return
    lastFresh.set(agent, now)
    try {
        await dbConnect()
        const backfilled = await AgentMetricTracking.findOne({ type: AGENT_METRICS_BACKFILL_KEY }).lean()
        if (!backfilled) {
            backfillInFlight ??= runAgentMetricsRoutine(new Date(now)).finally(() => {
                backfillInFlight = null
            })
            await backfillInFlight
            return
        }
        const from = new Date(now - 2 * DAY_MS)
        await syncAgentRuns([agent], from)
        if (agent === "opex" || agent === "maddox") await syncConversations({ from })
        const changedSince = await reconcileExcludedRuns()
        if (changedSince) await rollupUsageDays(changedSince)
    } catch (error) {
        log.warn({ err: error, agent }, "[agent-metrics] falha ao sincronizar as execuções recentes")
    }
}
