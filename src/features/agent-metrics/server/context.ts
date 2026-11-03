import { dbConnect } from "@/lib/db"
import { AgentMetricTracking, AgentRun, AgentUsageDay } from "@/lib/db/models/AgentMetrics"
import { AuditLog } from "@/lib/db/models/AuditLog"
import { DevTask } from "@/lib/db/models/DevTask"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { Project } from "@/lib/db/models/Project"
import { TaskBoardColumn } from "@/lib/db/models/TaskBoard"
import { dayKey, type BucketMode } from "@/lib/time/buckets"
import { agentDef, type AgentId } from "../catalog"
import { METRICS_TIME_ZONE, type TrackingKey } from "../constants"
import { usageSeries, type BucketContext } from "../logic/common"
import { metricsBucketMode, parseMargin, resolveMetricsRange, type AgentMetricsQuery, type MetricsRange } from "../period"
import type { MetricKpiDto, MetricFormat, UsagePointDto } from "../types"

/** Contexto comum do cálculo das métricas de um agente (período, filtros, marcadores "Dados desde"). */
export interface MetricsContext {
    agent: AgentId
    range: MetricsRange
    mode: BucketMode
    bucket: BucketContext
    clientIds: readonly string[]
    projectIds: readonly string[]
    margin: number
    now: Date
    since: (key: TrackingKey) => number | null
}

export async function createMetricsContext(agent: AgentId, query: AgentMetricsQuery, now: Date = new Date()): Promise<MetricsContext> {
    await dbConnect()
    const range = resolveMetricsRange(query, now)
    const mode = metricsBucketMode(range.from, range.to)
    const tracking = await AgentMetricTracking.find({}).select({ type: 1, since: 1 }).lean()
    const sinceMap = new Map(tracking.map((item) => [item.type, new Date(item.since).getTime()]))
    const def = agentDef(agent)
    return {
        agent,
        range,
        mode,
        bucket: { mode, from: range.from.getTime(), to: range.to.getTime(), timeZone: METRICS_TIME_ZONE },
        // Filtro que não se aplica ao agente é ignorado (fica oculto na tela).
        clientIds: def.filters.client ? query.clientes : [],
        projectIds: def.filters.repo ? query.repositorios : [],
        margin: parseMargin(query.margem),
        now,
        since: (key) => sinceMap.get(key) ?? null,
    }
}

/** Item passa nos filtros? Sem cliente ou sem repositório, sai quando o filtro correspondente está ativo. */
export function matchesFilters(ctx: Pick<MetricsContext, "clientIds" | "projectIds">, item: { clientId?: string | null; projectId?: string | null }): boolean {
    if (ctx.clientIds.length && (!item.clientId || !ctx.clientIds.includes(item.clientId))) return false
    if (ctx.projectIds.length && (!item.projectId || !ctx.projectIds.includes(item.projectId))) return false
    return true
}

/** Filtro Mongo equivalente a `matchesFilters` (campos `clientId`/`projectId`). */
export function mongoFilters(ctx: Pick<MetricsContext, "clientIds" | "projectIds">): Record<string, unknown> {
    const filter: Record<string, unknown> = {}
    if (ctx.clientIds.length) filter.clientId = { $in: [...ctx.clientIds] }
    if (ctx.projectIds.length) filter.projectId = { $in: [...ctx.projectIds] }
    return filter
}

/** Último uso do agente (ignora período e filtros). */
export async function lastUsedAt(agent: AgentId): Promise<string | null> {
    const last = await AgentRun.findOne({ agent }).sort({ finishedAt: -1 }).select({ finishedAt: 1 }).lean()
    return last?.finishedAt ? new Date(last.finishedAt).toISOString() : null
}

/** Uso por data: dias fechados do resumo diário; o dia de hoje, ao vivo das execuções. */
export async function usageOf(ctx: MetricsContext): Promise<UsagePointDto[]> {
    const today = dayKey(ctx.now.getTime(), METRICS_TIME_ZONE)
    const filters = mongoFilters(ctx)
    const days = await AgentUsageDay.find({ agent: ctx.agent, day: { $gte: ctx.range.fromDay, $lte: ctx.range.toDay, $lt: today }, ...filters })
        .select({ day: 1, runs: 1, failures: 1 })
        .lean()
    const rows = days.map((day) => ({ day: day.day, runs: day.runs, failures: day.failures }))
    if (ctx.range.toDay >= today) {
        const live = await AgentRun.find({ agent: ctx.agent, finishedAt: { $gte: new Date(ctx.bucket.from), $lte: ctx.range.to }, ...filters })
            .select({ finishedAt: 1, ok: 1 })
            .lean()
        for (const run of live) {
            if (dayKey(new Date(run.finishedAt).getTime(), METRICS_TIME_ZONE) !== today) continue
            rows.push({ day: today, runs: 1, failures: run.ok ? 0 : 1 })
        }
    }
    return usageSeries(rows, ctx.bucket)
}

/** Opções dos filtros (clientes e repositórios). */
export async function filterOptions(): Promise<{ clients: { id: string; name: string }[]; projects: { id: string; name: string; repo: string | null }[] }> {
    const [clients, projects] = await Promise.all([OrcamentoClient.find({}).select({ name: 1 }).sort({ name: 1 }).lean(), Project.find({}).select({ name: 1, repo: 1 }).sort({ name: 1 }).lean()])
    return {
        clients: clients.map((client) => ({ id: String(client._id), name: client.name })),
        projects: projects.map((project) => ({ id: String((project as unknown as { _id: unknown })._id), name: project.name, repo: (project as { repo?: string | null }).repo ?? null })),
    }
}

/** Tarefas por id com o que os filtros e as exclusões precisam. */
export async function loadTasks(ids: readonly string[]) {
    const valid = [...new Set(ids)].filter((id) => /^[a-f0-9]{24}$/i.test(id))
    if (!valid.length) return new Map<string, { clientId: string | null; projectId: string | null; archived: boolean; code: string; title: string }>()
    const docs = await DevTask.find({ _id: { $in: valid } }).select({ clientId: 1, projectId: 1, archived: 1, code: 1, title: 1 }).lean()
    return new Map(docs.map((doc) => [String(doc._id), { clientId: doc.clientId ?? null, projectId: doc.projectId ? String(doc.projectId) : null, archived: doc.archived === true, code: doc.code, title: doc.title }]))
}

/** Data de conclusão das tarefas (pela auditoria, mesma regra do Financeiro e dos Dashboards). */
export async function taskCompletionTimes(taskIds: readonly string[], until: Date): Promise<Map<string, number>> {
    if (!taskIds.length) return new Map()
    const { concludedColumnKeys, TASK_AUDIT_ENTITY } = await import("@/features/tasks/server/service")
    const { completionTimestamps } = await import("@/features/finance/logic")
    const closedSet = new Set(await concludedColumnKeys())
    const columns = await TaskBoardColumn.find({}).select({ key: 1, name: 1 }).lean()
    const nameToKey = new Map(columns.map((column) => [column.name, column.key]))
    const logs = await AuditLog.find({ entidade: TASK_AUDIT_ENTITY, entidadeId: { $in: [...taskIds] }, acao: { $in: ["MOVER", "ATUALIZAR"] }, timestamp: { $lte: until } })
        .select({ entidadeId: 1, acao: 1, dadosNovos: 1, timestamp: 1 })
        .lean()
    return completionTimestamps(logs as never, closedSet, nameToKey)
}

export const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString())

export function kpi(id: string, label: string, value: number | null, format: MetricFormat, hint: string, since: number | null = null, extra: Partial<MetricKpiDto> = {}): MetricKpiDto {
    return { id, label, hint, value: value === null || Number.isNaN(value) ? null : value, format, since: iso(since), ...extra }
}

export function inRange(ctx: MetricsContext, ms: number | null | undefined): ms is number {
    return typeof ms === "number" && ms >= ctx.range.from.getTime() && ms <= ctx.range.to.getTime()
}
