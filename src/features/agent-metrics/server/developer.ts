import { AgentMetricEvent } from "@/lib/db/models/AgentMetrics"
import { AgenticEvent, AgenticWorkbench } from "@/lib/db/models/Agentic"
import { WORKBENCH_STAGE_LABELS } from "@/features/agentic/constants"
import { METRIC_EVENT, type CorrectionKind } from "../constants"
import {
    classifyLegacyCorrections,
    DEVELOPER_DEFAULT_LINES,
    DEVELOPER_PERCENT_KEYS,
    mergeCorrections,
    PR_REQUEST_PREFIX,
    REOPEN_PREFIX,
    RETRY_USER_TEXTS,
    stageDurations,
    summarizeDeveloper,
    type DeveloperPercentKey,
    type DeveloperWorkbenchFacts,
} from "../logic/developer"
import type { AgentMetricsDto } from "../types"
import { iso, kpi, loadTasks, matchesFilters, type MetricsContext } from "./context"

export const DEVELOPER_PERCENT_LABELS: Record<DeveloperPercentKey, string> = {
    regression: "% de regressão",
    reopened: "↳ % reabertas",
    regressionFinding: "↳ % com achado de regressão",
    previewCorrection: "↳ % com correção de prévia",
    blocked: "% de bloqueio pelo Adversário",
    lesson: "% de lições do Mentor",
    oneShot: "% de one shot",
    conflict: "% de conflito de merge",
    ciFailed: "% de CI com falha",
    ciFixed: "% de CI corrigido automaticamente",
    interrupted: "% interrompidas",
    resumed: "% retomadas",
    retried: "% com nova tentativa",
}

const HINTS: Record<DeveloperPercentKey, string> = {
    regression: "Reaberta, achado de regressão ou correção de prévia",
    reopened: "Reaberta depois de concluída",
    regressionFinding: "O Adversário apontou achado de Regressão",
    previewCorrection: "Ao menos um pedido de correção da prévia",
    blocked: "Ao menos uma rodada que bloqueou",
    lesson: "Ao menos uma memória registrada pelo Mentor",
    oneShot: "Sem correção de plano, de prévia nem pedido do PR",
    conflict: "Ao menos uma resolução de conflito",
    ciFailed: "Ao menos uma falha de CI no PR",
    ciFixed: "Entre as com CI falho, corrigidas pela etapa de correção de CI",
    interrupted: "Ao menos uma interrupção pedida por você",
    resumed: "Ao menos uma reconexão à execução",
    retried: "Ao menos um \"Tentar novamente\"",
}

interface UserEvent {
    ts: number
    text: string
}

type RawEvent = { workbenchId: unknown; ts: Date; payload: { type?: string; stage?: string; text?: string } }

/** Agente Desenvolvedor: mesas concluídas no período (com os filtros), com as definições da issue. */
export async function developerMetrics(ctx: MetricsContext): Promise<Partial<AgentMetricsDto>> {
    const docs = await AgenticWorkbench.find({ stage: "done", completedAt: { $gte: ctx.range.from, $lte: ctx.range.to } })
        .select({ taskId: 1, centralId: 1, startedAt: 1, createdAt: 1, completedAt: 1, plans: 1, pastPrs: 1, pr: 1, usage: 1 })
        .lean()
    const tasks = await loadTasks(docs.map((doc) => doc.taskId))
    const base = docs.filter((doc) => {
        const task = tasks.get(doc.taskId)
        return task && !task.archived && matchesFilters(ctx, task)
    })
    const ids = base.map((doc) => String(doc._id))

    const [rawEvents, metricEvents, { AdversarialReview, adversarialDb }, { MentorRun, mentorDb }] = await Promise.all([
        ids.length ? AgenticEvent.find({ workbenchId: { $in: ids }, "payload.type": { $in: ["turn", "user"] } }).select({ workbenchId: 1, ts: 1, "payload.type": 1, "payload.stage": 1, "payload.text": 1 }).lean<RawEvent[]>() : Promise.resolve([] as RawEvent[]),
        ids.length ? AgentMetricEvent.find({ workbenchId: { $in: ids }, agent: "desenvolvedor" }).select({ workbenchId: 1, type: 1, at: 1, data: 1 }).lean() : Promise.resolve([]),
        import("@/features/adversarial-agent/server/models"),
        import("@/features/adversarial-agent/server/mentor/models"),
    ])
    await Promise.all([adversarialDb(), mentorDb()])
    const [reviews, mentorRuns] = ids.length
        ? await Promise.all([
              AdversarialReview.find({ workbenchId: { $in: ids } }).select({ workbenchId: 1, findings: 1 }).lean(),
              MentorRun.find({ workbenchId: { $in: ids }, status: { $in: ["created", "updated"] } }).select({ workbenchId: 1 }).lean(),
          ])
        : [[], []]

    const turnsBy = new Map<string, { ts: number; stage: string }[]>()
    const usersBy = new Map<string, UserEvent[]>()
    for (const event of rawEvents) {
        const id = String(event.workbenchId)
        const ts = new Date(event.ts).getTime()
        if (event.payload?.type === "turn" && event.payload.stage) turnsBy.set(id, [...(turnsBy.get(id) ?? []), { ts, stage: event.payload.stage }])
        if (event.payload?.type === "user" && typeof event.payload.text === "string") usersBy.set(id, [...(usersBy.get(id) ?? []), { ts, text: event.payload.text }])
    }
    const factsBy = new Map<string, { type: string; at: number; data: Record<string, unknown> | null }[]>()
    for (const event of metricEvents) {
        const id = String(event.workbenchId)
        factsBy.set(id, [...(factsBy.get(id) ?? []), { type: event.type, at: new Date(event.at).getTime(), data: (event.data as Record<string, unknown> | null) ?? null }])
    }
    const regressionBy = new Set<string>()
    const blockedBy = new Set<string>()
    for (const review of reviews) {
        const findings = (review.findings ?? []) as { category?: string; blocking?: boolean }[]
        if (findings.some((finding) => finding.category === "regression")) regressionBy.add(String(review.workbenchId))
        if (findings.some((finding) => finding.blocking)) blockedBy.add(String(review.workbenchId))
    }
    const lessonBy = new Set(mentorRuns.map((run) => String(run.workbenchId)))

    const correctionSince = ctx.since(METRIC_EVENT.correction)
    const since = { interrupted: ctx.since(METRIC_EVENT.interrupted), resumed: ctx.since(METRIC_EVENT.resumed), ciFixed: ctx.since(METRIC_EVENT.ciFixed), stages: ctx.since(METRIC_EVENT.stageEntered) }

    const facts: DeveloperWorkbenchFacts[] = base.map((doc) => {
        const id = String(doc._id)
        const turns = turnsBy.get(id) ?? []
        const users = usersBy.get(id) ?? []
        const events = factsBy.get(id) ?? []
        const has = (type: string) => events.some((event) => event.type === type)
        const planTimes = (doc.plans ?? []).map((plan) => new Date(plan.createdAt).getTime())
        const prRequests = users.filter((user) => user.text.startsWith(PR_REQUEST_PREFIX)).map((user) => user.ts)
        const corrections = mergeCorrections(
            planTimes,
            (times) => classifyLegacyCorrections(times, turns, prRequests),
            events.filter((event) => event.type === METRIC_EVENT.correction).map((event) => ({ at: event.at, kind: (event.data?.kind as CorrectionKind) ?? "plan" })),
            correctionSince,
        )
        const completedAt = new Date(doc.completedAt!).getTime()
        const startedAt = new Date(doc.startedAt ?? doc.createdAt ?? doc.completedAt!).getTime()
        const stageEntries = events.filter((event) => event.type === METRIC_EVENT.stageEntered && typeof event.data?.stage === "string").map((event) => ({ at: event.at, stage: String(event.data!.stage) }))
        const usage = doc.usage ?? null
        return {
            id,
            completedAt,
            startedAt,
            mergedAt: doc.pr?.mergedAt ? new Date(doc.pr.mergedAt).getTime() : null,
            planVersions: planTimes.length,
            corrections,
            reopened: (doc.pastPrs?.length ?? 0) > 0 || users.some((user) => user.text.startsWith(REOPEN_PREFIX)) || has(METRIC_EVENT.reopened),
            regressionFinding: regressionBy.has(id),
            blocked: blockedBy.has(id),
            lesson: lessonBy.has(id),
            conflict: turns.some((turn) => turn.stage === "resolving_conflicts") || has(METRIC_EVENT.conflict),
            ciFailed: turns.some((turn) => turn.stage === "fixing_ci") || has(METRIC_EVENT.ciFailed),
            ciFixed: has(METRIC_EVENT.ciFixed),
            interrupted: has(METRIC_EVENT.interrupted),
            resumed: has(METRIC_EVENT.resumed),
            retried: users.some((user) => RETRY_USER_TEXTS.includes(user.text)) || has(METRIC_EVENT.retried),
            costUsd: usage?.costUsd ?? null,
            tokens: usage ? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) : null,
            stageDurations: stageEntries.length ? stageDurations(stageEntries, completedAt) : null,
        }
    })

    const summary = summarizeDeveloper(facts, ctx.bucket, since)
    const sinceOf = (key: DeveloperPercentKey) => (key === "interrupted" ? since.interrupted : key === "resumed" ? since.resumed : key === "ciFixed" ? since.ciFixed : null)
    const percentKpis = DEVELOPER_PERCENT_KEYS.map((key) => kpi(key, DEVELOPER_PERCENT_LABELS[key], summary.percents[key], "percent", HINTS[key], sinceOf(key)))
    const correctionApprox = correctionSince !== null && facts.some((item) => item.startedAt < correctionSince)

    return {
        baseCount: summary.base,
        baseLabel: summary.base === 1 ? "1 mesa concluída" : `${summary.base} mesas concluídas`,
        emptyReason: "Nenhuma mesa foi concluída no período com estes filtros. As porcentagens são calculadas sobre as mesas concluídas (mesas abertas aparecem só no uso).",
        kpis: [
            ...percentKpis.map((item) => (item.id === "previewCorrection" && correctionApprox ? { ...item, approximateUntil: iso(correctionSince) } : item)),
            kpi("cycles", "Ciclos de correção por mesa", summary.cyclesPerWorkbench, "decimal", "Correções de plano, de prévia e pedidos do PR"),
            kpi("hoursToMerge", "Tempo de mesa", summary.hoursToMerge, "hours", "Média da abertura ao merge"),
            kpi("cost", "Custo por mesa", summary.costPerWorkbench, "usd", "Média das mesas com registro"),
            kpi("tokens", "Tokens por mesa", summary.tokensPerWorkbench, "tokens", "Média das mesas com registro"),
        ],
        lines: [
            {
                id: "percentages",
                title: "Métricas ao longo do tempo",
                description: "Porcentagem das mesas concluídas em cada data. Sem mesas na data, não há ponto.",
                format: "percent",
                series: DEVELOPER_PERCENT_KEYS.map((key) => ({ key, label: DEVELOPER_PERCENT_LABELS[key], defaultSelected: DEVELOPER_DEFAULT_LINES.includes(key) })),
                points: summary.series,
            },
        ],
        bars: [
            {
                id: "stages",
                title: "Tempo médio por etapa",
                description: "Horas em cada etapa, das mesas com o registro de etapas.",
                format: "hours",
                items: summary.stageHours.map((item) => ({ key: item.stage, label: WORKBENCH_STAGE_LABELS[item.stage as keyof typeof WORKBENCH_STAGE_LABELS] ?? item.stage, value: item.hours })),
            },
        ],
        notices: [
            ...(since.interrupted ? [{ label: "Interrompidas, retomadas, CI corrigido e tempo por etapa", since: iso(since.interrupted)! }] : []),
        ],
    }
}
