import { AgentConversation, AgentMetricEvent, AgentRun } from "@/lib/db/models/AgentMetrics"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { TaskRefinement } from "@/lib/db/models/Refinement"
import { WORKBENCH_STAGE_LABELS } from "@/features/agentic/constants"
import { DomainError } from "@/lib/api/route"
import { agentDef, type AgentId } from "../catalog"
import { METRIC_EVENT } from "../constants"
import type { AgentHistoryQuery } from "../period"
import type { AgentHistoryItemDto, AgentHistoryPageDto } from "../types"
import { createMetricsContext, loadTasks, matchesFilters, mongoFilters, type MetricsContext } from "./context"

const taskHref = (taskId: string | null | undefined) => (taskId ? `/tarefas/${taskId}` : null)
const workbenchHref = (taskId: string | null | undefined) => (taskId ? `/desenvolvimento/${taskId}` : null)
const usd = (value: number | null | undefined) => (typeof value === "number" && value > 0 ? `US$ ${value.toFixed(2)}` : null)

function page<T>(items: readonly T[], query: AgentHistoryQuery): { slice: T[]; total: number } {
    const start = (query.page - 1) * query.limit
    return { slice: items.slice(start, start + query.limit), total: items.length }
}

async function developerHistory(ctx: MetricsContext, query: AgentHistoryQuery) {
    const docs = await AgenticWorkbench.find({ $or: [{ startedAt: { $gte: ctx.range.from, $lte: ctx.range.to } }, { completedAt: { $gte: ctx.range.from, $lte: ctx.range.to } }, { updatedAt: { $gte: ctx.range.from, $lte: ctx.range.to } }] })
        .select({ taskId: 1, taskCode: 1, taskTitle: 1, stage: 1, runState: 1, startedAt: 1, completedAt: 1, updatedAt: 1, usage: 1 })
        .sort({ updatedAt: -1 })
        .lean()
    const tasks = await loadTasks(docs.map((doc) => doc.taskId))
    const rows = docs.filter((doc) => {
        const task = tasks.get(doc.taskId)
        return task && !task.archived && matchesFilters(ctx, task)
    })
    const { slice, total } = page(rows, query)
    const items: AgentHistoryItemDto[] = slice.map((doc) => ({
        id: String(doc._id),
        at: new Date(doc.completedAt ?? doc.updatedAt ?? doc.startedAt).toISOString(),
        title: `${doc.taskCode} · ${doc.taskTitle}`,
        subtitle: WORKBENCH_STAGE_LABELS[doc.stage as keyof typeof WORKBENCH_STAGE_LABELS] ?? doc.stage,
        status: doc.stage === "done" ? { label: "Concluída", tone: "success" } : doc.runState === "failed" ? { label: "Falhou", tone: "danger" } : doc.runState === "running" ? { label: "Executando", tone: "info" } : { label: "Aberta", tone: "muted" },
        href: workbenchHref(doc.taskId),
        unavailable: null,
        chips: [usd(doc.usage?.costUsd)].filter((chip): chip is string => Boolean(chip)),
    }))
    return { items, total }
}

async function refinerHistory(ctx: MetricsContext, query: AgentHistoryQuery) {
    const started = await AgentMetricEvent.find({ agent: "refinador", type: METRIC_EVENT.refinementStarted, at: { $gte: ctx.range.from, $lte: ctx.range.to }, ...mongoFilters(ctx) })
        .sort({ at: -1 })
        .lean()
    const refIds = started.map((event) => event.refId).filter((id): id is string => Boolean(id))
    const [related, live] = refIds.length
        ? await Promise.all([AgentMetricEvent.find({ agent: "refinador", refId: { $in: refIds } }).select({ refId: 1, type: 1 }).lean(), TaskRefinement.find({ _id: { $in: refIds } }).select({ runState: 1, resolved: 1 }).lean()])
        : [[], []]
    const liveBy = new Map(live.map((doc) => [String(doc._id), doc]))
    const tasks = await loadTasks(started.map((event) => event.taskId ?? ""))
    const rows = started.filter((event) => !tasks.get(event.taskId ?? "")?.archived)
    const { slice, total } = page(rows, query)
    const items: AgentHistoryItemDto[] = slice.map((event) => {
        const types = new Set(related.filter((item) => item.refId === event.refId).map((item) => item.type))
        const current = event.refId ? liveBy.get(event.refId) : undefined
        const task = tasks.get(event.taskId ?? "")
        const status: AgentHistoryItemDto["status"] = types.has(METRIC_EVENT.refinementCompleted)
            ? { label: "Especificação aplicada", tone: "success" }
            : types.has(METRIC_EVENT.refinementAbandoned)
              ? { label: "Abandonado", tone: "warning" }
              : current?.runState === "running"
                ? { label: "Em andamento", tone: "info" }
                : current?.runState === "failed" || current?.runState === "interrupted"
                  ? { label: "Interrompido", tone: "danger" }
                  : { label: "Aguardando respostas", tone: "muted" }
        return {
            id: String(event._id),
            at: new Date(event.at).toISOString(),
            title: task ? `${task.code} · ${task.title}` : String((event.data as { taskTitle?: string } | null)?.taskTitle ?? "Tarefa removida"),
            subtitle: null,
            status,
            href: task ? taskHref(event.taskId) : null,
            unavailable: task ? null : "Tarefa removida",
            chips: [],
        }
    })
    return { items, total }
}

async function architectHistory(ctx: MetricsContext, query: AgentHistoryQuery) {
    const { ArchitectDiagram, architectDb } = await import("@/features/architect-agent/server/models")
    await architectDb()
    const docs = await ArchitectDiagram.find({ startedAt: { $gte: ctx.range.from, $lte: ctx.range.to } })
        .select({ taskId: 1, taskCode: 1, taskTitle: 1, version: 1, state: 1, startedAt: 1, finishedAt: 1, graph: 1, usage: 1 })
        .sort({ startedAt: -1 })
        .lean()
    const tasks = await loadTasks(docs.map((doc) => doc.taskId))
    const rows = docs.filter((doc) => {
        const task = tasks.get(doc.taskId)
        return task && !task.archived && matchesFilters(ctx, task)
    })
    const { slice, total } = page(rows, query)
    const STATE: Record<string, AgentHistoryItemDto["status"]> = {
        running: { label: "Gerando", tone: "info" },
        done: { label: "Concluída", tone: "success" },
        superseded: { label: "Substituída", tone: "muted" },
        failed: { label: "Falhou", tone: "danger" },
        interrupted: { label: "Interrompida", tone: "warning" },
    }
    const items: AgentHistoryItemDto[] = slice.map((doc) => ({
        id: String(doc._id),
        at: new Date(doc.finishedAt ?? doc.startedAt).toISOString(),
        title: `${doc.taskCode} · ${doc.taskTitle}`,
        subtitle: `Versão ${doc.version}${doc.graph ? ` · ${doc.graph.nodes.length} nós e ${doc.graph.edges.length} ligações` : ""}`,
        status: STATE[doc.state] ?? { label: doc.state, tone: "muted" },
        href: workbenchHref(doc.taskId),
        unavailable: null,
        chips: [usd(doc.usage?.costUsd)].filter((chip): chip is string => Boolean(chip)),
    }))
    return { items, total }
}

async function conversationHistory(ctx: MetricsContext, query: AgentHistoryQuery, agent: "opex" | "maddox") {
    const filter = { agent, startedAt: { $gte: ctx.range.from, $lte: ctx.range.to }, ...(ctx.clientIds.length ? { clientId: { $in: [...ctx.clientIds] } } : {}) }
    const [total, docs] = await Promise.all([
        AgentConversation.countDocuments(filter),
        AgentConversation.find(filter)
            .sort({ startedAt: -1 })
            .skip((query.page - 1) * query.limit)
            .limit(query.limit)
            .lean(),
    ])
    const base = agentDef(agent).href
    const items: AgentHistoryItemDto[] = docs.map((doc) => ({
        id: doc.sessionId,
        at: new Date(doc.lastMessageAt ?? doc.startedAt).toISOString(),
        title: doc.title || "Conversa sem título",
        subtitle: `${doc.scope === "portal" ? "Portal" : "Dono"} · ${doc.messages} mensage${doc.messages === 1 ? "m" : "ns"}`,
        status: doc.purgedAt ? { label: "Removida", tone: "muted" } : doc.failedReplies > 0 ? { label: "Com erro", tone: "warning" } : { label: "Ok", tone: "success" },
        href: doc.purgedAt ? null : `${base}/conversas/${doc.sessionId}`,
        unavailable: doc.purgedAt ? "Conversa removida pela retenção" : null,
        chips: [`${doc.inputTokens + doc.outputTokens} tokens`],
    }))
    return { items, total }
}

const KIND_LABELS: Record<string, string> = {
    "budget-preview": "Prévia do orçamento",
    "estimate-hours": "Estimativa de horas",
    "task-summary": "Resumo da tarefa",
    "task-tags": "Tags da tarefa",
}

async function runHistory(ctx: MetricsContext, query: AgentHistoryQuery, agent: AgentId) {
    const filter = { agent, finishedAt: { $gte: ctx.range.from, $lte: ctx.range.to }, ...mongoFilters(ctx) }
    const [total, docs] = await Promise.all([
        AgentRun.countDocuments(filter),
        AgentRun.find(filter)
            .sort({ finishedAt: -1 })
            .skip((query.page - 1) * query.limit)
            .limit(query.limit)
            .lean(),
    ])
    const items: AgentHistoryItemDto[] = docs.map((doc) => ({
        id: doc.dedupKey,
        at: new Date(doc.finishedAt).toISOString(),
        title: doc.taskCode && doc.title ? `${doc.taskCode} · ${doc.title}` : (doc.title ?? KIND_LABELS[doc.kind] ?? doc.kind),
        subtitle: KIND_LABELS[doc.kind] ?? doc.kind,
        status: doc.ok ? { label: "Concluída", tone: "success" } : { label: "Falhou", tone: "danger" },
        href: taskHref(doc.taskId),
        unavailable: doc.taskId ? null : "Sem tarefa vinculada",
        chips: [usd(doc.costUsd), doc.error ? doc.error.slice(0, 80) : null].filter((chip): chip is string => Boolean(chip)),
    }))
    return { items, total }
}

/** Aba Histórico dos agentes novos (OPE-122): execuções do período com os mesmos filtros, paginadas. */
export async function getAgentHistory(agent: AgentId, query: AgentHistoryQuery, now: Date = new Date()): Promise<AgentHistoryPageDto> {
    if (!agentDef(agent).hasHistory) throw new DomainError(404, "Este agente não tem a aba Histórico", "AGENT_HISTORY_NOT_FOUND")
    const ctx = await createMetricsContext(agent, query, now)
    const result =
        agent === "desenvolvedor"
            ? await developerHistory(ctx, query)
            : agent === "refinador"
              ? await refinerHistory(ctx, query)
              : agent === "arquiteto"
                ? await architectHistory(ctx, query)
                : agent === "opex" || agent === "maddox"
                  ? await conversationHistory(ctx, query, agent)
                  : await runHistory(ctx, query, agent)
    return { items: result.items, page: query.page, limit: query.limit, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / query.limit)) }
}
