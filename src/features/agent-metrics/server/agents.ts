import { AgentConversation, AgentMetricEvent, AgentRun } from "@/lib/db/models/AgentMetrics"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { DevTask } from "@/lib/db/models/DevTask"
import { OrcamentoDraft } from "@/lib/db/models/Orcamento"
import { PrReview } from "@/lib/db/models/PrReview"
import { TimeLog } from "@/lib/db/models/TimeLog"
import { FINDING_CATEGORY_LABELS } from "@/features/adversarial-agent/constants"
import { MENTOR_TARGET_LABELS } from "@/features/adversarial-agent/mentor/constants"
import { METRIC_EVENT } from "../constants"
import { eachBucketLabel, mergeLineSeries, percentSeries, pct, valueSeries } from "../logic/common"
import { summarizeAdversarial, summarizeBudgets, summarizeCatalog, summarizeConversations, summarizeDiagrams, summarizeEstimates, summarizeMentor, summarizeRefinements, summarizeReviews, suggestionOutcome, type ReviewFacts } from "../logic/agents"
import type { AgentMetricsPart } from "../types"
import { iso, kpi, loadTasks, matchesFilters, mongoFilters, taskCompletionTimes, type MetricsContext } from "./context"
import { COUNTED_RUN } from "./exclusions"

type Partial_ = AgentMetricsPart

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

// ── Orçamentista ─────────────────────────────────────────────────────────────

export async function budgetMetrics(ctx: MetricsContext): Promise<Partial_> {
    const estimated = await DevTask.find({ archived: { $ne: true }, "estimate.hours": { $gt: 0 }, ...mongoFilters(ctx) })
        .select({ estimate: 1, clientId: 1, projectId: 1 })
        .lean()
    const completion = await taskCompletionTimes(
        estimated.map((task) => String(task._id)),
        ctx.range.to,
    )
    const concluded = estimated.filter((task) => {
        const at = completion.get(String(task._id))
        return typeof at === "number" && at >= ctx.range.from.getTime() && at <= ctx.range.to.getTime()
    })
    const hours = concluded.length
        ? await TimeLog.aggregate<{ _id: string; minutes: number }>([{ $match: { taskId: { $in: concluded.map((task) => String(task._id)) } } }, { $group: { _id: "$taskId", minutes: { $sum: { $ifNull: ["$duration", 0] } } } }])
        : []
    const realBy = new Map(hours.map((row) => [row._id, row.minutes / 60]))
    const estimateItems = concluded.map((task) => ({ at: completion.get(String(task._id))!, estimatedHours: task.estimate?.hours ?? null, realHours: realBy.get(String(task._id)) ?? null }))
    const estimates = summarizeEstimates(estimateItems, ctx.margin)

    const drafts = await OrcamentoDraft.find({ clientId: { $ne: null }, preview: { $ne: null }, createdAt: { $gte: ctx.range.from, $lte: ctx.range.to }, ...mongoFilters(ctx) })
        .select({ status: 1, taskId: 1, correction: 1, createdAt: 1 })
        .lean()
    const corrected = new Set(
        (await AgentMetricEvent.find({ type: METRIC_EVENT.budgetCorrection, refId: { $in: drafts.map((draft) => String(draft._id)) } }).select({ refId: 1 }).lean()).map((event) => event.refId),
    )
    const draftItems = drafts.map((draft) => ({
        at: new Date((draft as { createdAt?: Date }).createdAt ?? ctx.now).getTime(),
        approved: draft.status === "approved" && Boolean(draft.taskId),
        corrected: Boolean(draft.correction?.trim()) || corrected.has(String(draft._id)),
    }))
    const budgets = summarizeBudgets(draftItems)

    const margin = ctx.margin / 100
    const estimateSeries = percentSeries(
        estimateItems
            .filter((item) => (item.estimatedHours ?? 0) > 0 && (item.realHours ?? 0) > 0)
            .map((item) => ({ at: item.at, flags: { withinMargin: Math.abs(item.realHours! - item.estimatedHours!) / item.estimatedHours! <= margin } })),
        ["withinMargin"] as const,
        ctx.bucket,
    )
    const errorSeries = valueSeries(
        estimateItems.filter((item) => (item.estimatedHours ?? 0) > 0 && (item.realHours ?? 0) > 0).map((item) => ({ at: item.at, values: { meanError: (Math.abs(item.realHours! - item.estimatedHours!) / item.estimatedHours!) * 100 } })),
        ["meanError"] as const,
        ctx.bucket,
        "avg",
    )
    const draftSeries = percentSeries(draftItems.map((item) => ({ at: item.at, flags: { approved: item.approved, corrected: item.corrected } })), ["approved", "corrected"] as const, ctx.bucket)
    const base = estimates.base + budgets.base
    return {
        baseCount: base,
        baseLabel: `${plural(estimates.base, "tarefa concluída com estimativa", "tarefas concluídas com estimativa")} · ${plural(budgets.base, "orçamento", "orçamentos")}`,
        emptyReason: "Nenhuma tarefa com estimativa da IA foi concluída e nenhum orçamento do portal teve prévia no período.",
        kpis: [
            kpi("meanError", "Erro médio da estimativa", estimates.meanErrorPercent, "percent", "Diferença entre as horas estimadas e as reais, em tarefas concluídas"),
            kpi("withinMargin", `% dentro da margem (±${ctx.margin}%)`, estimates.withinMarginPercent, "percent", "Estimativas com erro dentro da margem"),
            kpi("approved", "% de orçamentos aprovados", budgets.approvedPercent, "percent", "Orçamentos do portal que viraram tarefa aprovada"),
            kpi("corrected", "% de prévias corrigidas", budgets.correctedPercent, "percent", "Prévias com pedido de correção antes do envio"),
        ],
        lines: [
            {
                id: "percentages",
                title: "Métricas ao longo do tempo",
                description: "Estimativas pela data de conclusão da tarefa; orçamentos pela data de criação.",
                format: "percent",
                sampleLabel: "tarefas concluídas com estimativa ou orçamentos",
                series: [
                    { key: "withinMargin", label: `% dentro da margem (±${ctx.margin}%)`, defaultSelected: true },
                    { key: "approved", label: "% de orçamentos aprovados", defaultSelected: true },
                    { key: "meanError", label: "Erro médio da estimativa", defaultSelected: false },
                    { key: "corrected", label: "% de prévias corrigidas", defaultSelected: false },
                ],
                points: mergeLineSeries(errorSeries, estimateSeries, draftSeries),
            },
        ],
        bars: [],
        notices: [],
    }
}

// ── Catalogador ──────────────────────────────────────────────────────────────

export async function catalogMetrics(ctx: MetricsContext): Promise<Partial_> {
    const tasks = await DevTask.find({ archived: { $ne: true }, createdAt: { $gte: ctx.range.from, $lte: ctx.range.to }, ...mongoFilters(ctx) })
        .select({ summary: 1, tags: 1, createdAt: 1 })
        .lean()
    const summary = summarizeCatalog(tasks.map((task) => ({ summary: task.summary ?? null, tags: task.tags ?? [] })))
    const runs = await AgentRun.find({ agent: "catalogador", finishedAt: { $gte: ctx.range.from, $lte: ctx.range.to }, ...mongoFilters(ctx), ...COUNTED_RUN })
        .select({ finishedAt: 1, ok: 1, kind: 1 })
        .lean()
    const tagsSince = ctx.since("task-tags-failures")
    const failures = pct(runs.filter((run) => !run.ok).length, runs.length)
    const coverage = percentSeries(
        tasks.map((task) => ({ at: new Date((task as { createdAt?: Date }).createdAt ?? ctx.now).getTime(), flags: { summary: Boolean(task.summary?.trim()), tags: (task.tags ?? []).length > 0 } })),
        ["summary", "tags"] as const,
        ctx.bucket,
    )
    const failureSeries = percentSeries(runs.map((run) => ({ at: new Date(run.finishedAt).getTime(), flags: { failures: !run.ok } })), ["failures"] as const, ctx.bucket)
    return {
        baseCount: summary.base + runs.length,
        baseLabel: `${plural(summary.base, "tarefa criada", "tarefas criadas")} · ${plural(runs.length, "geração", "gerações")}`,
        emptyReason: "Nenhuma tarefa foi criada e nenhum resumo ou tag foi gerado no período com estes filtros.",
        kpis: [
            kpi("summary", "% com resumo", summary.summaryPercent, "percent", "Tarefas criadas no período com resumo"),
            kpi("tags", "% com tags", summary.tagsPercent, "percent", "Tarefas criadas no período com ao menos uma tag"),
            kpi("tagsPerTask", "Tags por tarefa", summary.tagsPerTask, "decimal", "Média das tarefas criadas no período"),
            kpi("failures", "% de falhas", failures, "percent", "Gerações de resumo ou de tags que terminaram com erro", tagsSince),
        ],
        lines: [
            {
                id: "percentages",
                title: "Métricas ao longo do tempo",
                description: "Cobertura pela data de criação da tarefa; falhas pela data da geração.",
                format: "percent",
                sampleLabel: "tarefas criadas ou gerações",
                series: [
                    { key: "summary", label: "% com resumo", defaultSelected: true },
                    { key: "tags", label: "% com tags", defaultSelected: true },
                    { key: "failures", label: "% de falhas", defaultSelected: false },
                ],
                points: mergeLineSeries(coverage, failureSeries),
            },
        ],
        bars: [{ id: "tags", title: "Tags mais usadas", description: "Tarefas criadas no período, por tag.", format: "count", items: summary.topTags.map((item) => ({ key: item.key, label: item.key, value: item.count })) }],
        notices: tagsSince ? [{ label: "Falhas de geração de tags", since: iso(tagsSince)! }] : [],
    }
}

// ── Refinador ────────────────────────────────────────────────────────────────

export async function refinerMetrics(ctx: MetricsContext): Promise<Partial_> {
    const since = ctx.since(METRIC_EVENT.refinementStarted)
    const started = await AgentMetricEvent.find({ agent: "refinador", type: METRIC_EVENT.refinementStarted, at: { $gte: ctx.range.from, $lte: ctx.range.to }, ...mongoFilters(ctx) })
        .select({ refId: 1, at: 1 })
        .lean()
    const refIds = started.map((event) => event.refId).filter((id): id is string => Boolean(id))
    const related = refIds.length ? await AgentMetricEvent.find({ agent: "refinador", refId: { $in: refIds } }).select({ refId: 1, type: 1, data: 1 }).lean() : []
    const items = started.map((event) => {
        const mine = related.filter((item) => item.refId === event.refId)
        const completed = mine.find((item) => item.type === METRIC_EVENT.refinementCompleted)
        return {
            refinementId: event.refId ?? "",
            startedAt: new Date(event.at).getTime(),
            completed: Boolean(completed),
            abandoned: !completed && mine.some((item) => item.type === METRIC_EVENT.refinementAbandoned),
            questions: mine.filter((item) => item.type === METRIC_EVENT.refinementQuestions).reduce((total, item) => total + (Number((item.data as { questions?: number } | null)?.questions) || 1), 0),
            durationMs: typeof (completed?.data as { durationMs?: number } | null)?.durationMs === "number" ? (completed!.data as { durationMs: number }).durationMs : null,
        }
    })
    const summary = summarizeRefinements(items)
    const series = percentSeries(
        items.filter((item) => item.completed || item.abandoned).map((item) => ({ at: item.startedAt, flags: { completed: item.completed } })),
        ["completed"] as const,
        ctx.bucket,
        { completed: since },
    )
    return {
        baseCount: summary.base,
        baseLabel: plural(summary.base, "refinamento iniciado", "refinamentos iniciados"),
        emptyReason: "Nenhum refinamento foi iniciado no período com estes filtros.",
        kpis: [
            kpi("completed", "% concluídos sem abandono", summary.completedPercent, "percent", "Chegaram à especificação final, comparados aos recomeçados ou excluídos", since),
            kpi("questions", "Perguntas por refinamento", summary.questionsPerRefinement, "decimal", "Média de perguntas feitas pelo agente", since),
            kpi("hoursToSpec", "Tempo até o refinamento", summary.hoursToSpec, "hours", "Do início até a especificação aplicada", since),
        ],
        lines: [{ id: "percentages", title: "Métricas ao longo do tempo", description: "Pela data de início do refinamento.", format: "percent", sampleLabel: "refinamentos", series: [{ key: "completed", label: "% concluídos sem abandono", defaultSelected: true }], points: series }],
        bars: [],
        notices: since ? [{ label: "Conclusão, perguntas e tempo do refinamento", since: iso(since)! }] : [],
    }
}

// ── Arquiteto ────────────────────────────────────────────────────────────────

export async function architectMetrics(ctx: MetricsContext): Promise<Partial_> {
    const { ArchitectDiagram, architectDb } = await import("@/features/architect-agent/server/models")
    await architectDb()
    const docs = await ArchitectDiagram.find({ state: { $in: ["done", "superseded"] }, finishedAt: { $gte: ctx.range.from, $lte: ctx.range.to } })
        .select({ taskId: 1, graph: 1, startedAt: 1, finishedAt: 1 })
        .lean()
    const tasks = await loadTasks(docs.map((doc) => doc.taskId))
    const items = docs
        .filter((doc) => {
            const task = tasks.get(doc.taskId)
            return task && !task.archived && matchesFilters(ctx, task)
        })
        .map((doc) => ({
            at: new Date(doc.finishedAt!).getTime(),
            nodes: doc.graph?.nodes?.length ?? 0,
            edges: doc.graph?.edges?.length ?? 0,
            durationMs: doc.startedAt && doc.finishedAt ? new Date(doc.finishedAt).getTime() - new Date(doc.startedAt).getTime() : null,
        }))
    const summary = summarizeDiagrams(items)
    return {
        baseCount: summary.base,
        baseLabel: plural(summary.base, "versão de diagrama", "versões de diagrama"),
        emptyReason: "Nenhuma versão de diagrama foi concluída no período com estes filtros.",
        kpis: [
            kpi("nodes", "Nós por diagrama", summary.nodes, "decimal", "Média das versões concluídas"),
            kpi("edges", "Ligações por diagrama", summary.edges, "decimal", "Média das versões concluídas"),
            kpi("duration", "Duração da geração", summary.durationMinutes, "duration", "Média por versão, em minutos"),
        ],
        lines: [
            {
                id: "size",
                title: "Tamanho do diagrama ao longo do tempo",
                description: `Média de nós e de ligações das versões concluídas ${eachBucketLabel(ctx.mode)}.`,
                format: "decimal",
                sampleLabel: "versões concluídas",
                series: [
                    { key: "nodes", label: "Nós", defaultSelected: true },
                    { key: "edges", label: "Ligações", defaultSelected: true },
                ],
                points: valueSeries(items.map((item) => ({ at: item.at, values: { nodes: item.nodes, edges: item.edges } })), ["nodes", "edges"] as const, ctx.bucket, "avg"),
            },
        ],
        bars: [],
        notices: [],
    }
}

// ── Adversário ───────────────────────────────────────────────────────────────

export async function adversarialMetrics(ctx: MetricsContext): Promise<Partial_> {
    const { AdversarialReview, adversarialDb } = await import("@/features/adversarial-agent/server/models")
    await adversarialDb()
    const docs = await AdversarialReview.find({ state: "done", finishedAt: { $gte: ctx.range.from, $lte: ctx.range.to } })
        .select({ workbenchId: 1, taskId: 1, findings: 1, decision: 1, finishedAt: 1 })
        .lean()
    const tasks = await loadTasks(docs.map((doc) => doc.taskId))
    const rounds = docs
        .filter((doc) => {
            const task = tasks.get(doc.taskId)
            return task && !task.archived && matchesFilters(ctx, task)
        })
        .map((doc) => {
            const findings = (doc.findings ?? []) as { category?: string; blocking?: boolean }[]
            return { workbenchId: String(doc.workbenchId), at: new Date(doc.finishedAt!).getTime(), blocked: findings.some((finding) => finding.blocking), decision: doc.decision ?? null, categories: findings.map((finding) => finding.category ?? "other") }
        })
    const summary = summarizeAdversarial(rounds)
    const label = (category: string) => FINDING_CATEGORY_LABELS[category as keyof typeof FINDING_CATEGORY_LABELS] ?? category
    const categoryKeys = summary.categories.map((item) => item.key)
    return {
        baseCount: summary.base,
        baseLabel: plural(summary.base, "rodada concluída", "rodadas concluídas"),
        emptyReason: "Nenhuma rodada do Adversário foi concluída no período com estes filtros.",
        kpis: [
            kpi("blocked", "% de bloqueio", summary.blockedPercent, "percent", "Rodadas com ao menos um achado bloqueante"),
            kpi("roundsPerWorkbench", "Rodadas por mesa", summary.roundsPerWorkbench, "decimal", "Média das mesas revisadas no período"),
            kpi("ignored", "% de bloqueios ignorados", summary.ignoredPercent, "percent", "Bloqueios em que você seguiu sem corrigir"),
        ],
        lines: [
            {
                id: "percentages",
                title: "Métricas ao longo do tempo",
                description: `Porcentagem das rodadas concluídas ${eachBucketLabel(ctx.mode)}. Nos dias sem rodadas, a linha liga os pontos vizinhos.`,
                format: "percent",
                sampleLabel: "rodadas concluídas",
                series: [
                    { key: "blocked", label: "% de bloqueio", defaultSelected: true },
                    { key: "ignored", label: "% de bloqueios ignorados", defaultSelected: true },
                ],
                points: mergeLineSeries(
                    percentSeries(rounds.map((round) => ({ at: round.at, flags: { blocked: round.blocked } })), ["blocked"] as const, ctx.bucket),
                    percentSeries(rounds.filter((round) => round.blocked).map((round) => ({ at: round.at, flags: { ignored: round.decision === "skipped" } })), ["ignored"] as const, ctx.bucket),
                ),
            },
            {
                id: "categories",
                title: "Achados por categoria ao longo do tempo",
                description: "Quantidade de achados de cada categoria nas rodadas concluídas.",
                format: "count",
                sampleLabel: null,
                series: categoryKeys.map((key, index) => ({ key, label: label(key), defaultSelected: index < 3 })),
                points: valueSeries(
                    rounds.map((round) => ({ at: round.at, values: Object.fromEntries(categoryKeys.map((key) => [key, round.categories.filter((category) => category === key).length])) })),
                    categoryKeys,
                    ctx.bucket,
                    "sum",
                ),
            },
        ],
        bars: [{ id: "categories", title: "Achados por categoria", description: "Todas as rodadas concluídas no período.", format: "count", items: summary.categories.map((item) => ({ key: item.key, label: label(item.key), value: item.count })) }],
        notices: [],
    }
}

// ── Revisor ──────────────────────────────────────────────────────────────────

export async function reviewerMetrics(ctx: MetricsContext): Promise<Partial_> {
    const docs = await PrReview.find({ state: { $in: ["done", "failed", "interrupted"] }, finishedAt: { $gte: ctx.range.from, $lte: ctx.range.to } }).lean()
    const workbenchIds = [...new Set(docs.map((doc) => doc.workbenchId).filter((id): id is string => Boolean(id)))]
    const workbenches = workbenchIds.length ? await AgenticWorkbench.find({ _id: { $in: workbenchIds } }).select({ taskId: 1, pr: 1, pastPrs: 1 }).lean() : []
    const wbById = new Map(workbenches.map((doc) => [String(doc._id), doc]))
    const tasks = await loadTasks(workbenches.map((doc) => doc.taskId))
    const centralIds = [...new Set(docs.map((doc) => doc.centralId).filter((id): id is string => Boolean(id)))]
    const { AgenticCentral } = await import("@/lib/db/models/Agentic")
    const centrals = centralIds.length ? await AgenticCentral.find({ _id: { $in: centralIds } }).select({ projectId: 1 }).lean() : []
    const projectOfCentral = new Map(centrals.map((central) => [String(central._id), String(central.projectId)]))
    const replanned = new Set(
        (await AgentMetricEvent.find({ type: METRIC_EVENT.prReviewReplanned, refId: { $in: docs.map((doc) => String(doc._id)) } }).select({ refId: 1 }).lean()).map((event) => event.refId),
    )
    // Primeira revisão concluída de cada PR sem o recorte de período: o PR só conta em "aprovação na
    // 1ª revisão" quando essa primeira revisão cai dentro do período (e dos filtros).
    const prPairs = [...new Map(docs.filter((doc) => doc.state === "done").map((doc) => [`${doc.repo}#${doc.number}`, { repo: doc.repo, number: doc.number }])).values()]
    const firstIds = new Set(
        prPairs.length
            ? (
                  await PrReview.aggregate<{ _id: unknown; first: unknown }>([
                      { $match: { state: "done", finishedAt: { $ne: null }, $or: prPairs } },
                      { $sort: { finishedAt: 1, _id: 1 } },
                      { $group: { _id: { repo: "$repo", number: "$number" }, first: { $first: "$_id" } } },
                  ])
              ).map((row) => String(row.first))
            : [],
    )
    const items: ReviewFacts[] = []
    for (const doc of docs) {
        const workbench = doc.workbenchId ? wbById.get(doc.workbenchId) : undefined
        const task = workbench ? tasks.get(workbench.taskId) : undefined
        if (task?.archived) continue
        const links = { clientId: task?.clientId ?? null, projectId: task?.projectId ?? (doc.centralId ? (projectOfCentral.get(doc.centralId) ?? null) : null) }
        if (!matchesFilters(ctx, links)) continue
        const prs = workbench ? [workbench.pr, ...(workbench.pastPrs ?? [])].filter(Boolean) : []
        const pr = prs.find((item) => item!.number === doc.number) ?? null
        items.push({
            id: String(doc._id),
            prKey: `${doc.repo}#${doc.number}`,
            at: new Date(doc.finishedAt!).getTime(),
            state: doc.state,
            verdict: doc.verdict ?? null,
            findings: typeof doc.findings === "number" ? doc.findings : null,
            durationMs: doc.startedAt && doc.finishedAt ? new Date(doc.finishedAt).getTime() - new Date(doc.startedAt).getTime() : null,
            prOutcome: pr?.state === "merged" ? "merged" : pr?.state === "closed" ? "closed" : "open",
            replannedExact: replanned.has(String(doc._id)),
            replannedApprox: (pr?.autoReviewReplans ?? 0) > 0,
            firstOfPr: doc.state === "done" && firstIds.has(String(doc._id)),
        })
    }
    const exactSince = ctx.since(METRIC_EVENT.prReviewReplanned)
    const summary = summarizeReviews(items, exactSince)
    const findingsSince = ctx.since("pr-review-findings")
    const approximate = exactSince !== null && items.some((item) => item.verdict === "changes_requested" && item.at < exactSince)
    const firstFlags = items.filter((item) => item.firstOfPr)
    return {
        baseCount: summary.base,
        baseLabel: plural(summary.base, "revisão", "revisões"),
        emptyReason: "Nenhuma revisão de PR terminou no período com estes filtros.",
        kpis: [
            kpi("firstApproval", "% de aprovação na 1ª revisão", summary.firstApprovalPercent, "percent", "Primeira revisão de cada PR aprovada"),
            kpi("findings", "Achados por revisão", summary.findingsPerReview, "decimal", "Média das revisões que informam o total de achados", findingsSince),
            kpi("accepted", "% de sugestões aceitas", summary.acceptedPercent, "percent", "Pedido de mudança seguido de replanejamento, contra PRs mergeados sem ele", null, approximate ? { approximateUntil: iso(exactSince) } : {}),
            kpi("duration", "Duração média", summary.durationMinutes, "duration", "Por revisão, em minutos"),
            kpi("failures", "% de falhas", summary.failurePercent, "percent", "Revisões que falharam ou foram interrompidas"),
        ],
        lines: [
            {
                id: "percentages",
                title: "Métricas ao longo do tempo",
                description: "Pela data em que a revisão terminou.",
                format: "percent",
                sampleLabel: "revisões",
                series: [
                    { key: "firstApproval", label: "% de aprovação na 1ª revisão", defaultSelected: true },
                    { key: "accepted", label: "% de sugestões aceitas", defaultSelected: true },
                    { key: "failures", label: "% de falhas", defaultSelected: false },
                ],
                points: mergeLineSeries(
                    percentSeries(firstFlags.map((item) => ({ at: item.at, flags: { firstApproval: item.verdict === "approved" } })), ["firstApproval"] as const, ctx.bucket),
                    percentSeries(
                        items
                            .map((item) => ({ item, outcome: item.state === "done" ? suggestionOutcome(item, exactSince) : null }))
                            .filter((entry) => entry.outcome !== null)
                            .map((entry) => ({ at: entry.item.at, flags: { accepted: entry.outcome === "accepted" } })),
                        ["accepted"] as const,
                        ctx.bucket,
                    ),
                    percentSeries(items.map((item) => ({ at: item.at, flags: { failures: item.state !== "done" } })), ["failures"] as const, ctx.bucket),
                ),
            },
        ],
        bars: [],
        notices: [
            ...(findingsSince ? [{ label: "Achados por revisão", since: iso(findingsSince)! }] : []),
            ...(approximate && exactSince ? [{ label: "Sugestões aceitas (exato; antes disso, aproximado por PR)", since: iso(exactSince)! }] : []),
        ],
    }
}

// ── Mentor ───────────────────────────────────────────────────────────────────

export async function mentorMetrics(ctx: MetricsContext): Promise<Partial_> {
    const { MentorRun, mentorDb } = await import("@/features/adversarial-agent/server/mentor/models")
    await mentorDb()
    const docs = await MentorRun.find({ finishedAt: { $gte: ctx.range.from, $lte: ctx.range.to } })
        .select({ taskId: 1, status: 1, target: 1, finishedAt: 1 })
        .lean()
    const tasks = await loadTasks(docs.map((doc) => doc.taskId ?? ""))
    const runs = docs
        .filter((doc) => {
            const task = doc.taskId ? tasks.get(doc.taskId) : undefined
            if (task?.archived) return false
            return matchesFilters(ctx, task ?? {})
        })
        .map((doc) => ({ at: new Date(doc.finishedAt!).getTime(), status: doc.status, target: doc.target ?? null }))
    const summary = summarizeMentor(runs)
    const finished = runs.filter((run) => !["queued", "running"].includes(run.status))
    return {
        baseCount: summary.base,
        baseLabel: plural(summary.base, "execução", "execuções"),
        emptyReason: "O Mentor não terminou nenhuma execução no período com estes filtros.",
        kpis: [
            kpi("lessons", "% de lições registradas", summary.lessonPercent, "percent", "Execuções que geraram memória, contra as descartadas"),
            kpi("created", "Memórias criadas", summary.created, "count", "No período"),
            kpi("updated", "Memórias editadas", summary.updated, "count", "No período"),
            kpi("failures", "% de falhas", summary.failurePercent, "percent", "Execuções que terminaram com erro"),
        ],
        lines: [
            {
                id: "percentages",
                title: "Métricas ao longo do tempo",
                description: "Pela data em que a execução terminou.",
                format: "percent",
                sampleLabel: "execuções",
                series: [
                    { key: "lessons", label: "% de lições registradas", defaultSelected: true },
                    { key: "failures", label: "% de falhas", defaultSelected: true },
                ],
                points: mergeLineSeries(
                    percentSeries(
                        finished.filter((run) => ["created", "updated", "discarded", "skipped"].includes(run.status)).map((run) => ({ at: run.at, flags: { lessons: run.status === "created" || run.status === "updated" } })),
                        ["lessons"] as const,
                        ctx.bucket,
                    ),
                    percentSeries(finished.map((run) => ({ at: run.at, flags: { failures: run.status === "failed" } })), ["failures"] as const, ctx.bucket),
                ),
            },
        ],
        bars: [
            {
                id: "targets",
                title: "Destino das lições",
                description: "Memórias criadas ou editadas, por lista.",
                format: "count",
                items: summary.targets.map((item) => ({ key: item.key, label: MENTOR_TARGET_LABELS[item.key as keyof typeof MENTOR_TARGET_LABELS]?.label ?? item.key, value: item.count })),
            },
        ],
        notices: [],
    }
}

// ── Opex e Maddox ────────────────────────────────────────────────────────────

export async function conversationMetrics(ctx: MetricsContext, agent: "opex" | "maddox"): Promise<Partial_> {
    const docs = await AgentConversation.find({ agent, startedAt: { $gte: ctx.range.from, $lte: ctx.range.to }, ...(ctx.clientIds.length ? { clientId: { $in: [...ctx.clientIds] } } : {}) }).lean()
    const summary = summarizeConversations(docs)
    const since = ctx.since("conversations")
    const at = (doc: { startedAt: Date }) => new Date(doc.startedAt).getTime()
    return {
        baseCount: summary.base,
        baseLabel: plural(summary.base, "conversa", "conversas"),
        emptyReason: "Nenhuma conversa começou no período com estes filtros.",
        kpis: [
            kpi("conversations", "Conversas", summary.base, "count", `${summary.owner} do dono · ${summary.portal} do portal`),
            kpi("messages", "Mensagens por conversa", summary.messagesPerConversation, "decimal", "Média, suas e do agente"),
            kpi("confirmed", "% de ações confirmadas", summary.confirmedPercent, "percent", "Ações destrutivas confirmadas, contra as canceladas"),
            kpi("tokens", "Tokens por conversa", summary.tokensPerConversation, "tokens", "Média de entrada e saída"),
            kpi("cost", "Custo por conversa", summary.costPerConversation, "usd", "Quando houver registro de custo"),
        ],
        lines: [
            {
                id: "percentages",
                title: "Métricas ao longo do tempo",
                description: "Pela data de início da conversa.",
                format: "percent",
                sampleLabel: "conversas",
                series: [
                    { key: "confirmed", label: "% de ações confirmadas", defaultSelected: true },
                    { key: "failedReplies", label: "% de respostas com erro", defaultSelected: true },
                ],
                points: valueSeries(
                    docs.map((doc) => ({ at: at(doc), values: { confirmed: pct(doc.confirmed, doc.confirmed + doc.cancelled), failedReplies: pct(doc.failedReplies, doc.replies) } })),
                    ["confirmed", "failedReplies"] as const,
                    ctx.bucket,
                    "avg",
                ),
            },
            {
                id: "conversations",
                title: "Conversas por data",
                description: "Conversas iniciadas pelo dono e pelo portal.",
                format: "count",
                sampleLabel: null,
                series: [
                    { key: "owner", label: "Dono", defaultSelected: true },
                    { key: "portal", label: "Portal", defaultSelected: true },
                ],
                points: valueSeries(docs.map((doc) => ({ at: at(doc), values: { owner: doc.scope === "owner" ? 1 : 0, portal: doc.scope === "portal" ? 1 : 0 } })), ["owner", "portal"] as const, ctx.bucket, "sum").map((point) => ({ ...point, owner: point.owner ?? 0, portal: point.portal ?? 0 })),
            },
            {
                id: "tokens",
                title: "Tokens por data",
                description: "Tokens de entrada e saída das conversas iniciadas em cada data.",
                format: "tokens",
                sampleLabel: null,
                series: [{ key: "tokens", label: "Tokens", defaultSelected: true }],
                points: valueSeries(docs.map((doc) => ({ at: at(doc), values: { tokens: doc.inputTokens + doc.outputTokens } })), ["tokens"] as const, ctx.bucket, "sum"),
            },
        ],
        bars: [
            {
                id: "tools",
                title: "Ferramentas mais usadas",
                description: "Chamadas no período, com a porcentagem de falha de cada uma.",
                format: "count",
                items: summary.tools.slice(0, 12).map((tool) => ({ key: tool.name, label: tool.name, value: tool.calls, detail: tool.failurePercent === null ? null : `${tool.failurePercent.toFixed(0)}% de falha` })),
            },
        ],
        notices: since ? [{ label: "Conversas apagadas pela retenção antes desta data não entram", since: iso(since)! }] : [],
    }
}

// ── Agentes rotineiros (OPE-130) ─────────────────────────────────────────────

/** Todas as execuções dos agentes rotineiros no período (a página de cada agente tem a própria Visão geral). */
export async function routineMetrics(ctx: MetricsContext): Promise<Partial_> {
    const { RoutineRun } = await import("@/lib/db/models/RoutineAgent")
    const docs = await RoutineRun.find({ createdAt: { $gte: ctx.range.from, $lte: ctx.range.to } })
        .select({ status: 1, createdAt: 1, finishedAt: 1, activeMs: 1 })
        .lean()
    const finished = docs.filter((doc) => ["completed", "error", "expired", "canceled"].includes(doc.status))
    const at = (doc: { finishedAt?: Date | null; createdAt: Date }) => new Date(doc.finishedAt ?? doc.createdAt).getTime()
    const completed = finished.filter((doc) => doc.status === "completed").length
    const errors = finished.filter((doc) => doc.status === "error").length
    return {
        baseCount: docs.length,
        baseLabel: plural(docs.length, "execução", "execuções"),
        emptyReason: "Nenhum agente rotineiro executou no período.",
        kpis: [
            kpi("runs", "Execuções", docs.length, "count", "Disparadas no período"),
            kpi("completed", "% concluídas", pct(completed, finished.length), "percent", "Das execuções que terminaram"),
            kpi("errors", "% com erro", pct(errors, finished.length), "percent", "Das execuções que terminaram"),
        ],
        lines: [
            {
                id: "percentages",
                title: "Métricas ao longo do tempo",
                description: "Pela data em que a execução terminou.",
                format: "percent",
                sampleLabel: "execuções",
                series: [
                    { key: "completed", label: "% concluídas", defaultSelected: true },
                    { key: "errors", label: "% com erro", defaultSelected: true },
                ],
                points: percentSeries(finished.map((doc) => ({ at: at(doc), flags: { completed: doc.status === "completed", errors: doc.status === "error" } })), ["completed", "errors"] as const, ctx.bucket),
            },
        ],
        bars: [],
        notices: [],
    }
}
