import { dbConnect } from "@/lib/db"
import { AgentRun, AgentMetricTracking, type IAgentRun } from "@/lib/db/models/AgentMetrics"
import { AgenticEvent, AgenticWorkbench } from "@/lib/db/models/Agentic"
import { AiUsageLog } from "@/lib/db/models/Ai"
import { AiConsumption } from "@/lib/db/models/AiConsumption"
import { OpexMessage, OpexSession } from "@/lib/db/models/Opex"
import { PrReview } from "@/lib/db/models/PrReview"
import { AGENT_IDS, type AgentId } from "../catalog"
import { createLinkResolver } from "./links"

/**
 * Sincroniza `agent_runs` a partir das fontes do app (OPE-122). Idempotente: a `dedupKey` vem do id
 * de origem, então rodar de novo só atualiza. Fontes:
 *
 * | Agente | Fonte |
 * |---|---|
 * | Desenvolvedor | `agentic_events` `turn-end` (mesas vivas: a mesa excluída sai das métricas) |
 * | Adversário | `adversarial_reviews` |
 * | Revisor | `pr_reviews` |
 * | Mentor | `adversarial_mentor_runs` |
 * | Arquiteto | `architect_diagrams` |
 * | Opex e Maddox | `opex_messages` (respostas do assistente) |
 * | Orçamentista | `ai_consumption_logs` (`budget-preview`) e `ai_usage_logs` (`estimate-hours`) |
 * | Catalogador | `ai_usage_logs` (`task-summary`, `task-tags`) |
 * | Refinador | gravado no fim de cada turno (`recordAgentRun`) + consumo antigo (`refinement`) |
 *
 * `ai_usage_logs` expira em 90 dias: o consumo (`ai_consumption_logs`, sem expiração) cobre o que é
 * anterior ao limite gravado na primeira sincronização (`usage-logs:<feature>`), sem contar duas vezes.
 */

type RunDoc = Omit<IAgentRun, "data"> & { data?: Record<string, unknown> | null }

const ANY = new Date(0)

async function upsertRuns(runs: readonly RunDoc[]): Promise<number> {
    if (!runs.length) return 0
    for (let index = 0; index < runs.length; index += 500) {
        const slice = runs.slice(index, index + 500)
        await AgentRun.bulkWrite(
            slice.map((run) => ({ updateOne: { filter: { dedupKey: run.dedupKey }, update: { $set: { ...run, data: run.data ?? null } }, upsert: true } })),
            { ordered: false },
        )
    }
    return runs.length
}

const base = { refId: null, title: null, taskId: null, taskCode: null, clientId: null, projectId: null, centralId: null, workbenchId: null, sessionId: null, startedAt: null, ok: true, error: null, inputTokens: null, outputTokens: null, costUsd: null, durationMs: null } as const

const asDate = (value: unknown): Date | null => (value ? new Date(value as string) : null)

// ── Fontes ────────────────────────────────────────────────────────────────

async function developerRuns(from: Date): Promise<RunDoc[]> {
    const events = await AgenticEvent.find({ "payload.type": "turn-end", ts: { $gte: from } }).select({ workbenchId: 1, seq: 1, payload: 1, ts: 1 }).lean()
    if (!events.length) return []
    const ids = [...new Set(events.map((event) => event.workbenchId))]
    const workbenches = await AgenticWorkbench.find({ _id: { $in: ids } }).select({ taskId: 1, taskCode: 1, taskTitle: 1, centralId: 1 }).lean()
    const byId = new Map(workbenches.map((doc) => [String(doc._id), doc]))
    const resolve = createLinkResolver()
    const out: RunDoc[] = []
    for (const event of events) {
        const workbench = byId.get(String(event.workbenchId))
        if (!workbench) continue
        const payload = event.payload as { outcome?: string; message?: string | null; durationMs?: number; costUsd?: number }
        const links = await resolve({ taskId: workbench.taskId, centralId: workbench.centralId })
        const finishedAt = new Date(event.ts)
        out.push({
            ...base,
            dedupKey: `dev-turn:${String(event.workbenchId)}:${event.seq}`,
            agent: "desenvolvedor",
            kind: "turn",
            refId: String(event.workbenchId),
            title: workbench.taskTitle ?? null,
            taskId: workbench.taskId,
            taskCode: workbench.taskCode ?? null,
            clientId: links.clientId,
            projectId: links.projectId,
            centralId: workbench.centralId,
            workbenchId: String(event.workbenchId),
            startedAt: payload.durationMs ? new Date(finishedAt.getTime() - payload.durationMs) : null,
            finishedAt,
            ok: payload.outcome === "succeeded",
            error: payload.outcome === "succeeded" ? null : (payload.message ?? payload.outcome ?? null),
            costUsd: typeof payload.costUsd === "number" ? payload.costUsd : null,
            durationMs: payload.durationMs ?? null,
            data: { outcome: payload.outcome ?? null },
        })
    }
    return out
}

async function adversarialRuns(from: Date): Promise<RunDoc[]> {
    const { AdversarialReview, adversarialDb } = await import("@/features/adversarial-agent/server/models")
    await adversarialDb()
    const docs = await AdversarialReview.find({ state: { $ne: "running" }, finishedAt: { $gte: from } })
        .select({ workbenchId: 1, centralId: 1, taskId: 1, taskCode: 1, state: 1, error: 1, usage: 1, startedAt: 1, finishedAt: 1, round: 1, cycle: 1 })
        .lean()
    const resolve = createLinkResolver()
    const out: RunDoc[] = []
    for (const doc of docs) {
        if (!doc.finishedAt) continue
        const links = await resolve({ taskId: doc.taskId, centralId: doc.centralId })
        out.push({
            ...base,
            dedupKey: `adversarial:${String(doc._id)}`,
            agent: "adversario",
            kind: "round",
            refId: String(doc._id),
            title: links.taskTitle,
            taskId: doc.taskId,
            taskCode: doc.taskCode,
            clientId: links.clientId,
            projectId: links.projectId,
            centralId: doc.centralId,
            workbenchId: doc.workbenchId,
            startedAt: asDate(doc.startedAt),
            finishedAt: new Date(doc.finishedAt),
            ok: doc.state === "done",
            error: doc.state === "done" ? null : (doc.error ?? doc.state),
            inputTokens: doc.usage?.inputTokens ?? null,
            outputTokens: doc.usage?.outputTokens ?? null,
            costUsd: doc.usage?.costUsd ?? null,
            durationMs: doc.startedAt ? new Date(doc.finishedAt).getTime() - new Date(doc.startedAt).getTime() : null,
        })
    }
    return out
}

async function reviewerRuns(from: Date): Promise<RunDoc[]> {
    const docs = await PrReview.find({ state: { $in: ["done", "failed", "interrupted"] }, finishedAt: { $gte: from } }).lean()
    const resolve = createLinkResolver()
    const out: RunDoc[] = []
    for (const doc of docs) {
        if (!doc.finishedAt) continue
        const links = await resolve({ workbenchId: doc.workbenchId, centralId: doc.centralId })
        const startedAt = asDate(doc.startedAt)
        out.push({
            ...base,
            dedupKey: `pr-review:${String(doc._id)}:${startedAt?.getTime() ?? new Date(doc.finishedAt).getTime()}`,
            agent: "revisor",
            kind: "review",
            refId: String(doc._id),
            title: `${doc.repo}#${doc.number}`,
            taskId: links.taskId,
            taskCode: links.taskCode,
            clientId: links.clientId,
            projectId: links.projectId,
            centralId: doc.centralId ?? null,
            workbenchId: doc.workbenchId ?? null,
            startedAt,
            finishedAt: new Date(doc.finishedAt),
            ok: doc.state === "done",
            error: doc.state === "done" ? null : (doc.error ?? doc.state),
            inputTokens: doc.usage?.inputTokens ?? null,
            outputTokens: doc.usage?.outputTokens ?? null,
            costUsd: doc.usage?.costUsd ?? null,
            durationMs: startedAt ? new Date(doc.finishedAt).getTime() - startedAt.getTime() : null,
            data: { verdict: doc.verdict ?? null },
        })
    }
    return out
}

async function mentorRuns(from: Date): Promise<RunDoc[]> {
    const { MentorRun, mentorDb } = await import("@/features/adversarial-agent/server/mentor/models")
    await mentorDb()
    const docs = await MentorRun.find({ status: { $nin: ["queued", "running"] }, finishedAt: { $gte: from } }).lean()
    const resolve = createLinkResolver()
    const out: RunDoc[] = []
    for (const doc of docs) {
        if (!doc.finishedAt) continue
        const links = await resolve({ taskId: doc.taskId, centralId: doc.centralId })
        out.push({
            ...base,
            dedupKey: `mentor:${String(doc._id)}`,
            agent: "mentor",
            kind: "mentor",
            refId: String(doc._id),
            title: links.taskTitle,
            taskId: doc.taskId ?? null,
            taskCode: doc.taskCode ?? null,
            clientId: links.clientId,
            projectId: links.projectId,
            centralId: doc.centralId ?? null,
            workbenchId: doc.workbenchId ?? null,
            startedAt: asDate(doc.startedAt),
            finishedAt: new Date(doc.finishedAt),
            ok: doc.status !== "failed",
            error: doc.status === "failed" ? (doc.error ?? "falhou") : null,
            costUsd: doc.costUsd ?? null,
            durationMs: doc.durationMs ?? null,
            data: { status: doc.status },
        })
    }
    return out
}

async function architectRuns(from: Date): Promise<RunDoc[]> {
    const { ArchitectDiagram, architectDb } = await import("@/features/architect-agent/server/models")
    await architectDb()
    const docs = await ArchitectDiagram.find({ state: { $nin: ["running"] }, finishedAt: { $gte: from } })
        .select({ workbenchId: 1, centralId: 1, taskId: 1, taskCode: 1, taskTitle: 1, version: 1, state: 1, error: 1, usage: 1, startedAt: 1, finishedAt: 1 })
        .lean()
    const resolve = createLinkResolver()
    const out: RunDoc[] = []
    for (const doc of docs) {
        if (!doc.finishedAt) continue
        const links = await resolve({ taskId: doc.taskId, centralId: doc.centralId })
        out.push({
            ...base,
            dedupKey: `diagram:${String(doc._id)}`,
            agent: "arquiteto",
            kind: "diagram",
            refId: String(doc._id),
            title: `${doc.taskTitle} · versão ${doc.version}`,
            taskId: doc.taskId,
            taskCode: doc.taskCode,
            clientId: links.clientId,
            projectId: links.projectId,
            centralId: doc.centralId,
            workbenchId: doc.workbenchId,
            startedAt: asDate(doc.startedAt),
            finishedAt: new Date(doc.finishedAt),
            ok: doc.state === "done" || doc.state === "superseded",
            error: doc.state === "failed" || doc.state === "interrupted" ? (doc.error ?? doc.state) : null,
            inputTokens: doc.usage?.inputTokens ?? null,
            outputTokens: doc.usage?.outputTokens ?? null,
            costUsd: doc.usage?.costUsd ?? null,
            durationMs: doc.startedAt ? new Date(doc.finishedAt).getTime() - new Date(doc.startedAt).getTime() : null,
            data: { state: doc.state },
        })
    }
    return out
}

async function conversationRuns(agent: "opex" | "maddox", from: Date): Promise<RunDoc[]> {
    const sessions = await OpexSession.find(agent === "opex" ? { $or: [{ agent: "opex" }, { agent: { $exists: false } }] } : { agent: "maddox" })
        .select({ title: 1, clientId: 1 })
        .lean()
    if (!sessions.length) return []
    const byId = new Map(sessions.map((doc) => [String(doc._id), doc]))
    const messages = await OpexMessage.find({ sessionId: { $in: [...byId.keys()] }, role: "assistant", kind: "message", createdAt: { $gte: from } })
        .select({ sessionId: 1, status: 1, error: 1, usage: 1, durationMs: 1, createdAt: 1 })
        .lean()
    return messages.map((message) => {
        const session = byId.get(String(message.sessionId))!
        const finishedAt = new Date(message.createdAt)
        return {
            ...base,
            dedupKey: `reply:${String(message._id)}`,
            agent,
            kind: "reply",
            refId: String(message.sessionId),
            title: session.title || null,
            clientId: session.clientId ?? null,
            sessionId: String(message.sessionId),
            finishedAt,
            ok: message.status !== "error",
            error: message.status === "error" ? (message.error ?? "erro") : null,
            inputTokens: message.usage?.inputTokens ?? null,
            outputTokens: message.usage?.outputTokens ?? null,
            durationMs: message.durationMs ?? null,
        }
    })
}

/** Limite entre consumo (antes) e registro de uso (depois) de uma feature, fixado na primeira vez. */
async function usageLogBoundary(feature: string): Promise<Date> {
    const key = `usage-logs:${feature}`
    const saved = await AgentMetricTracking.findOne({ type: key }).lean()
    if (saved) return new Date(saved.since)
    const oldest = await AiUsageLog.findOne({ feature }).sort({ createdAt: 1 }).select({ createdAt: 1 }).lean<{ createdAt?: Date }>()
    const since = oldest?.createdAt ? new Date(oldest.createdAt) : new Date()
    await AgentMetricTracking.updateOne({ type: key }, { $setOnInsert: { type: key, since } }, { upsert: true })
    const stored = await AgentMetricTracking.findOne({ type: key }).lean()
    return stored ? new Date(stored.since) : since
}

async function featureRuns(agent: AgentId, feature: string, from: Date): Promise<RunDoc[]> {
    const boundary = await usageLogBoundary(feature)
    const resolve = createLinkResolver()
    const out: RunDoc[] = []
    const logs = await AiUsageLog.find({ feature, createdAt: { $gte: from > boundary ? from : boundary } }).lean()
    for (const log of logs) {
        const links = await resolve({ taskId: log.subject ?? null })
        const finishedAt = new Date(log.createdAt)
        out.push({
            ...base,
            dedupKey: `usage:${String(log._id)}`,
            agent,
            kind: feature,
            refId: log.subject ?? null,
            title: links.taskTitle,
            taskId: links.taskId,
            taskCode: links.taskCode,
            clientId: links.clientId,
            projectId: links.projectId,
            startedAt: log.durationMs ? new Date(finishedAt.getTime() - log.durationMs) : null,
            finishedAt,
            ok: log.ok !== false,
            error: log.ok === false ? (log.error ?? "falhou") : null,
            inputTokens: log.inputTokens ?? null,
            outputTokens: log.outputTokens ?? null,
            costUsd: log.costUsd ?? null,
            durationMs: log.durationMs ?? null,
        })
    }
    if (from < boundary) out.push(...(await consumptionRuns(agent, feature, from, boundary)))
    return out
}

/** Consumo (só sucessos, sem expiração) como execução, no intervalo `[from, to)`. */
async function consumptionRuns(agent: AgentId, origin: string, from: Date, to: Date = new Date(8.64e15)): Promise<RunDoc[]> {
    const rows = await AiConsumption.find({ origin, createdAt: { $gte: from, $lt: to } }).lean()
    const resolve = createLinkResolver()
    const out: RunDoc[] = []
    for (const row of rows) {
        const links = await resolve({ taskId: row.subject ?? null })
        out.push({
            ...base,
            dedupKey: `consumption:${row.dedupKey}`,
            agent,
            kind: origin,
            refId: row.subject ?? null,
            title: links.taskTitle,
            taskId: links.taskId,
            taskCode: links.taskCode,
            clientId: links.clientId,
            projectId: links.projectId,
            finishedAt: new Date(row.createdAt),
            inputTokens: row.inputTokens ?? null,
            outputTokens: row.outputTokens ?? null,
            costUsd: row.costUsd ?? null,
        })
    }
    return out
}

/** Refinamentos anteriores ao registro por turno: um passo de consumo por tarefa e dia vira uma execução. */
async function legacyRefinementRuns(from: Date): Promise<RunDoc[]> {
    const since = await AgentMetricTracking.findOne({ type: "refinement-started" }).lean()
    const to = since ? new Date(since.since) : new Date()
    if (from >= to) return []
    const rows = await consumptionRuns("refinador", "refinement", from, to)
    const grouped = new Map<string, RunDoc>()
    for (const row of rows) {
        const key = `legacy-refinement:${row.refId ?? "?"}:${row.finishedAt.toISOString().slice(0, 10)}`
        const hit = grouped.get(key)
        if (!hit) grouped.set(key, { ...row, dedupKey: key, kind: "refinement-turn" })
        else {
            hit.costUsd = (hit.costUsd ?? 0) + (row.costUsd ?? 0)
            hit.inputTokens = (hit.inputTokens ?? 0) + (row.inputTokens ?? 0)
            hit.outputTokens = (hit.outputTokens ?? 0) + (row.outputTokens ?? 0)
            if (row.finishedAt > hit.finishedAt) hit.finishedAt = row.finishedAt
        }
    }
    return [...grouped.values()]
}

const SOURCES: Record<AgentId, (from: Date) => Promise<RunDoc[]>> = {
    opex: (from) => conversationRuns("opex", from),
    maddox: (from) => conversationRuns("maddox", from),
    orcamentista: async (from) => [...(await consumptionRuns("orcamentista", "budget-preview", from)), ...(await featureRuns("orcamentista", "estimate-hours", from))],
    catalogador: async (from) => [...(await featureRuns("catalogador", "task-summary", from)), ...(await featureRuns("catalogador", "task-tags", from))],
    refinador: legacyRefinementRuns,
    desenvolvedor: developerRuns,
    arquiteto: architectRuns,
    adversario: adversarialRuns,
    revisor: reviewerRuns,
    mentor: mentorRuns,
}

/** Sincroniza as execuções dos agentes a partir de `from` (padrão: tudo). Devolve quantas gravou. */
export async function syncAgentRuns(agents: readonly AgentId[] = AGENT_IDS, from: Date = ANY): Promise<number> {
    await dbConnect()
    let total = 0
    for (const agent of agents) total += await upsertRuns(await SOURCES[agent](from))
    return total
}
