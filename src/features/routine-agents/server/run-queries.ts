import { Types } from "mongoose"
import { RoutineAgent, RoutineRun, RoutineRunStep } from "@/lib/db/models/RoutineAgent"
import { brasiliaParts } from "../recurrence"
import type { RoutineRunStatus } from "../status"
import type { RoutineAgentMetricsDto, RoutineCostDto, RoutineMoneyPair, RoutineRunDetailDto, RoutineRunDto } from "../types"
import { emptyTotals, mergeTotals, type CostTotals } from "@nandobfer/integracoes/modules/integrations/ia/features/ai-billing/effective"
import { computeRunCosts, costBreakdown, toCostDto, type RunCostData } from "./run-costs"
import { loadRunDoc } from "./runs"
import { loadAgentDoc, routineDb, routineLog, toRunDto, type RoutineRunDoc } from "./shared"

/** Custos das execuções; falha na leitura não derruba a tela (os custos ficam desconhecidos, com log). */
async function safeRunCosts(runIds: readonly string[]): Promise<RunCostData> {
    try {
        return await computeRunCosts(runIds)
    } catch (error) {
        routineLog.warn({ err: error instanceof Error ? error.message : String(error) }, "[routine-agents] custos das execuções indisponíveis")
        return { byRun: new Map(), steps: [] }
    }
}

const NO_STEPS_NOTICE = "Execução sem registro de consumo por passo: custo desconhecido."

/** Custo da execução: só o motor Opex; sem passos gravados mas com tokens, desconhecido (Parcial). */
export function runCostTotals(run: Pick<RoutineRunDoc, "_id" | "snapshot" | "tokens">, data: RunCostData): CostTotals | null {
    if (run.snapshot?.engine !== "opex") return null
    const totals = data.byRun.get(String(run._id))
    if (totals) return totals
    if ((run.tokens ?? 0) <= 0) return null
    return { ...emptyTotals(), partial: true, notices: [NO_STEPS_NOTICE] }
}

const runCostDto = (run: RoutineRunDoc, data: RunCostData): RoutineCostDto | null => {
    const totals = runCostTotals(run, data)
    return totals ? toCostDto(totals) : null
}

/** Leituras das execuções (OPE-130): lista por agente, detalhe com passos e as métricas da Visão geral. */

export async function listRoutineRuns(options: { agentId?: string; status?: RoutineRunStatus[]; limit?: number } = {}): Promise<RoutineRunDto[]> {
    await routineDb()
    const filter: Record<string, unknown> = {}
    if (options.agentId) {
        await loadAgentDoc(options.agentId)
        filter.agentId = new Types.ObjectId(options.agentId)
    }
    if (options.status?.length) filter.status = { $in: options.status }
    const runs = await RoutineRun.find(filter)
        .sort({ createdAt: -1 })
        .limit(Math.min(options.limit ?? 200, 500))
        .select({ messages: 0, payload: 0 })
        .lean<RoutineRunDoc[]>()
    const names = new Map((await RoutineAgent.find({ _id: { $in: [...new Set(runs.map((run) => String(run.agentId)))] } }).select({ name: 1 }).lean()).map((agent) => [String(agent._id), agent.name]))
    const costs = await safeRunCosts(runs.filter((run) => run.snapshot?.engine === "opex").map((run) => String(run._id)))
    return runs.map((run) => toRunDto(run, names.get(String(run.agentId)) ?? "Agente rotineiro", runCostDto(run, costs)))
}

export async function getRoutineRunDetail(runId: string): Promise<RoutineRunDetailDto> {
    const run = await loadRunDoc(runId)
    const agent = await RoutineAgent.findById(run.agentId).select({ name: 1 }).lean()
    const steps = await RoutineRunStep.find({ runId: run._id }).sort({ createdAt: 1 }).limit(1_000).lean()
    const counts = new Map<string, number>()
    for (const step of steps) if (step.kind === "tool" && step.toolName) counts.set(step.toolName, (counts.get(step.toolName) ?? 0) + 1)
    const costs = run.snapshot?.engine === "opex" ? await safeRunCosts([String(run._id)]) : { byRun: new Map(), steps: [] }
    return {
        ...toRunDto(run, agent?.name ?? "Agente rotineiro", runCostDto(run, costs)),
        costByModel: costBreakdown(costs.steps).models,
        steps: steps.map((step) => ({
            id: String(step._id),
            kind: step.kind,
            label: step.label,
            detail: step.detail ?? null,
            toolName: step.toolName ?? null,
            durationMs: step.durationMs ?? null,
            error: step.error === true,
            at: new Date(step.createdAt).toISOString(),
        })),
        tools: [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    }
}

const dayKey = (date: Date) => {
    const p = brasiliaParts(date)
    return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

type MetricsRun = Pick<RoutineRunDoc, "_id" | "status" | "activeMs" | "tokens" | "costUsd" | "costPartial" | "createdAt" | "snapshot">

const EMPTY_PAIR: RoutineMoneyPair = { listUsd: null, effectiveUsd: null, listBrl: null, effectiveBrl: null }
const pairOf = (totals: CostTotals): RoutineMoneyPair => ({ listUsd: totals.listUsd, effectiveUsd: totals.effectiveUsd, listBrl: totals.listBrl, effectiveBrl: totals.effectiveBrl })
const divide = (value: number | null, count: number) => (value === null || count <= 0 ? null : Math.round((value / count) * 1e6) / 1e6)
const averageOf = (totals: CostTotals, count: number): RoutineMoneyPair => ({
    listUsd: divide(totals.listUsd, count),
    effectiveUsd: divide(totals.effectiveUsd, count),
    listBrl: divide(totals.listBrl, count),
    effectiveBrl: divide(totals.effectiveBrl, count),
})

/**
 * KPIs e série por dia (horário de Brasília) de um conjunto de execuções no período. Pura: usada pela
 * Visão geral de um agente e pela lista `/agentes-rotineiros` (uma consulta para todos), para os
 * números das duas telas nunca divergirem. O custo (OPE-203) conta no dia em que a execução foi disparada.
 */
export function aggregateRoutineMetrics(runs: readonly MetricsRun[], range: { from: Date; to: Date }, lastRunAt: string | null, costs: RunCostData = { byRun: new Map(), steps: [] }): RoutineAgentMetricsDto {
    const finished = runs.filter((run) => run.status === "completed" || run.status === "error" || run.status === "expired" || run.status === "canceled")
    const durations = finished.map((run) => run.activeMs ?? 0).filter((ms) => ms > 0)
    const known = runs.filter((run) => typeof run.costUsd === "number")
    const days = new Map<string, RoutineAgentMetricsDto["days"][number]>()
    const blankDay = (key: string): RoutineAgentMetricsDto["days"][number] => ({ day: key, runs: 0, completed: 0, errors: 0, tokens: 0, costUsd: null, cost: EMPTY_PAIR })
    for (let cursor = new Date(range.from); cursor <= range.to; cursor = new Date(cursor.getTime() + 86_400_000)) {
        const key = dayKey(cursor)
        days.set(key, blankDay(key))
    }
    const dayCosts = new Map<string, CostTotals[]>()
    const runTotals: CostTotals[] = []
    for (const run of runs) {
        const key = dayKey(new Date(run.createdAt))
        const row = days.get(key) ?? blankDay(key)
        row.runs++
        if (run.status === "completed") row.completed++
        if (run.status === "error") row.errors++
        row.tokens += run.tokens ?? 0
        if (typeof run.costUsd === "number") row.costUsd = (row.costUsd ?? 0) + run.costUsd
        days.set(key, row)
        const totals = runCostTotals(run, costs)
        if (totals) {
            runTotals.push(totals)
            dayCosts.set(key, [...(dayCosts.get(key) ?? []), totals])
        }
    }
    for (const [key, list] of dayCosts) {
        const row = days.get(key)
        if (row) row.cost = pairOf(mergeTotals(list))
    }
    const total = mergeTotals(runTotals)
    const calendarDays = days.size
    const activeDays = dayCosts.size
    const runIds = new Set(runs.map((run) => String(run._id)))
    return {
        kpis: {
            runs: runs.length,
            completed: runs.filter((run) => run.status === "completed").length,
            errors: runs.filter((run) => run.status === "error").length,
            avgDurationMs: durations.length ? Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length) : null,
            tokens: runs.reduce((sum, run) => sum + (run.tokens ?? 0), 0),
            costUsd: known.length ? known.reduce((sum, run) => sum + (run.costUsd ?? 0), 0) : null,
            // Soma parcial (OPE-133/m_b0b199d8): algum passo ou execução sem custo informado.
            costPartial: runs.some((run) => run.costPartial || typeof run.costUsd !== "number") && known.length > 0,
        },
        days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
        cost: {
            totals: toCostDto(total),
            perRun: averageOf(total, runTotals.length),
            perCalendarDay: averageOf(total, calendarDays),
            perActiveDay: averageOf(total, activeDays),
            runsWithCost: runTotals.length,
            calendarDays,
            activeDays,
        },
        breakdown: costBreakdown(costs.steps.filter((step) => runIds.has(step.runId))),
        lastRunAt,
    }
}

const METRICS_FIELDS = { agentId: 1, status: 1, activeMs: 1, tokens: 1, costUsd: 1, costPartial: 1, createdAt: 1, "snapshot.engine": 1 } as const

const opexRunIds = (runs: readonly RoutineRunDoc[]) => runs.filter((run) => run.snapshot?.engine === "opex").map((run) => String(run._id))

/** KPIs e série por dia (horário de Brasília) das execuções do agente no período. */
export async function getRoutineAgentMetrics(agentId: string, range: { from: Date; to: Date }): Promise<RoutineAgentMetricsDto> {
    const agent = await loadAgentDoc(agentId)
    const runs = await RoutineRun.find({ agentId: agent._id, createdAt: { $gte: range.from, $lte: range.to } })
        .select(METRICS_FIELDS)
        .lean<RoutineRunDoc[]>()
    const last = await RoutineRun.findOne({ agentId: agent._id }).sort({ createdAt: -1 }).select({ createdAt: 1 }).lean()
    return aggregateRoutineMetrics(runs, range, last ? new Date(last.createdAt).toISOString() : null, await safeRunCosts(opexRunIds(runs)))
}

/** Métricas de todos os agentes não arquivados no período, numa consulta só (lista `/agentes-rotineiros`). */
export async function getRoutineAgentsMetrics(range: { from: Date; to: Date }): Promise<Record<string, RoutineAgentMetricsDto>> {
    await routineDb()
    const agents = await RoutineAgent.find({ status: { $ne: "archived" } })
        .select({ _id: 1, lastRunAt: 1 })
        .lean<{ _id: Types.ObjectId; lastRunAt?: Date | null }[]>()
    const ids = agents.map((agent) => agent._id)
    const runs = ids.length ? await RoutineRun.find({ agentId: { $in: ids }, createdAt: { $gte: range.from, $lte: range.to } }).select(METRICS_FIELDS).lean<RoutineRunDoc[]>() : []
    const costs = await safeRunCosts(opexRunIds(runs))
    const byAgent = new Map<string, RoutineRunDoc[]>()
    for (const run of runs) byAgent.set(String(run.agentId), [...(byAgent.get(String(run.agentId)) ?? []), run])
    return Object.fromEntries(agents.map((agent) => [String(agent._id), aggregateRoutineMetrics(byAgent.get(String(agent._id)) ?? [], range, agent.lastRunAt ? new Date(agent.lastRunAt).toISOString() : null, costs)]))
}
