import { Types } from "mongoose"
import { RoutineAgent, RoutineRun, RoutineRunStep } from "@/lib/db/models/RoutineAgent"
import { brasiliaParts } from "../recurrence"
import type { RoutineRunStatus } from "../status"
import type { RoutineAgentMetricsDto, RoutineRunDetailDto, RoutineRunDto } from "../types"
import { loadRunDoc } from "./runs"
import { loadAgentDoc, routineDb, toRunDto, type RoutineRunDoc } from "./shared"

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
    return runs.map((run) => toRunDto(run, names.get(String(run.agentId)) ?? "Agente rotineiro"))
}

export async function getRoutineRunDetail(runId: string): Promise<RoutineRunDetailDto> {
    const run = await loadRunDoc(runId)
    const agent = await RoutineAgent.findById(run.agentId).select({ name: 1 }).lean()
    const steps = await RoutineRunStep.find({ runId: run._id }).sort({ createdAt: 1 }).limit(1_000).lean()
    const counts = new Map<string, number>()
    for (const step of steps) if (step.kind === "tool" && step.toolName) counts.set(step.toolName, (counts.get(step.toolName) ?? 0) + 1)
    return {
        ...toRunDto(run, agent?.name ?? "Agente rotineiro"),
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

type MetricsRun = Pick<RoutineRunDoc, "status" | "activeMs" | "tokens" | "costUsd" | "costPartial" | "createdAt">

/**
 * KPIs e série por dia (horário de Brasília) de um conjunto de execuções no período. Pura: usada pela
 * Visão geral de um agente e pela lista `/agentes-rotineiros` (uma consulta para todos), para os
 * números das duas telas nunca divergirem.
 */
export function aggregateRoutineMetrics(runs: readonly MetricsRun[], range: { from: Date; to: Date }, lastRunAt: string | null): RoutineAgentMetricsDto {
    const finished = runs.filter((run) => run.status === "completed" || run.status === "error" || run.status === "expired" || run.status === "canceled")
    const durations = finished.map((run) => run.activeMs ?? 0).filter((ms) => ms > 0)
    const known = runs.filter((run) => typeof run.costUsd === "number")
    const days = new Map<string, RoutineAgentMetricsDto["days"][number]>()
    for (let cursor = new Date(range.from); cursor <= range.to; cursor = new Date(cursor.getTime() + 86_400_000)) {
        const key = dayKey(cursor)
        days.set(key, { day: key, runs: 0, completed: 0, errors: 0, tokens: 0, costUsd: null })
    }
    for (const run of runs) {
        const key = dayKey(new Date(run.createdAt))
        const row = days.get(key) ?? { day: key, runs: 0, completed: 0, errors: 0, tokens: 0, costUsd: null }
        row.runs++
        if (run.status === "completed") row.completed++
        if (run.status === "error") row.errors++
        row.tokens += run.tokens ?? 0
        if (typeof run.costUsd === "number") row.costUsd = (row.costUsd ?? 0) + run.costUsd
        days.set(key, row)
    }
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
        lastRunAt,
    }
}

const METRICS_FIELDS = { agentId: 1, status: 1, activeMs: 1, tokens: 1, costUsd: 1, costPartial: 1, createdAt: 1 } as const

/** KPIs e série por dia (horário de Brasília) das execuções do agente no período. */
export async function getRoutineAgentMetrics(agentId: string, range: { from: Date; to: Date }): Promise<RoutineAgentMetricsDto> {
    const agent = await loadAgentDoc(agentId)
    const runs = await RoutineRun.find({ agentId: agent._id, createdAt: { $gte: range.from, $lte: range.to } })
        .select(METRICS_FIELDS)
        .lean<RoutineRunDoc[]>()
    const last = await RoutineRun.findOne({ agentId: agent._id }).sort({ createdAt: -1 }).select({ createdAt: 1 }).lean()
    return aggregateRoutineMetrics(runs, range, last ? new Date(last.createdAt).toISOString() : null)
}

/** Métricas de todos os agentes não arquivados no período, numa consulta só (lista `/agentes-rotineiros`). */
export async function getRoutineAgentsMetrics(range: { from: Date; to: Date }): Promise<Record<string, RoutineAgentMetricsDto>> {
    await routineDb()
    const agents = await RoutineAgent.find({ status: { $ne: "archived" } })
        .select({ _id: 1, lastRunAt: 1 })
        .lean<{ _id: Types.ObjectId; lastRunAt?: Date | null }[]>()
    const ids = agents.map((agent) => agent._id)
    const runs = ids.length ? await RoutineRun.find({ agentId: { $in: ids }, createdAt: { $gte: range.from, $lte: range.to } }).select(METRICS_FIELDS).lean<RoutineRunDoc[]>() : []
    const byAgent = new Map<string, RoutineRunDoc[]>()
    for (const run of runs) byAgent.set(String(run.agentId), [...(byAgent.get(String(run.agentId)) ?? []), run])
    return Object.fromEntries(agents.map((agent) => [String(agent._id), aggregateRoutineMetrics(byAgent.get(String(agent._id)) ?? [], range, agent.lastRunAt ? new Date(agent.lastRunAt).toISOString() : null)]))
}
