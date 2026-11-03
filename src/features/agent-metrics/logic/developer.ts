import type { CorrectionKind } from "../constants"
import { avg, pct, percentSeries, type BucketContext } from "./common"
import type { MetricPointDto } from "../types"

/**
 * Métricas do Agente Desenvolvedor (módulo puro, OPE-122). Base: mesas **concluídas** no período,
 * pela data da última conclusão (`completedAt`, sobrescrito a cada conclusão: a mesa reaberta conta
 * uma vez). Mesas abertas, excluídas ou de tarefa arquivada ficam fora. Ver
 * `aicontext/modules/agent-metrics.md`, "Agente Desenvolvedor".
 */

/** Textos exatos que a ação "Tentar novamente" grava como mensagem do usuário na mesa. */
export const RETRY_USER_TEXTS: readonly string[] = ["Tentar novamente", "Tentar a revisão adversária novamente", "Tentar a limpeza novamente", "Tentar build remoto novamente"]
export const PR_REQUEST_PREFIX = "Pedido de mudança no PR"
export const REOPEN_PREFIX = "Mesa reaberta:"

/** Etapas em que a mesa já tinha saído do planejamento (implementou, revisou, gerou prévia ou PR). */
/**
 * Etapas do lado do PR: a mesa abriu (ou mexia no) PR. Uma versão de plano depois delas veio de um
 * pedido de mudança no PR, mesmo quando o pedido foi feito pelo botão do app (que grava o texto do
 * pedido sem o prefixo "Pedido de mudança no PR").
 */
const PR_STAGES = new Set(["opening_pr", "pr_open", "changes_requested", "resolving_conflicts", "fixing_ci", "merging_pr"])
const POST_PLAN_STAGES = new Set(["implementing", "adversarial_review", "build_queued", "building", "preview", "opening_pr", "pr_open", "changes_requested", "resolving_conflicts", "fixing_ci", "merging_pr"])

export interface CorrectionCounts {
    plan: number
    preview: number
    pr: number
}

/**
 * Classificação retroativa das versões de plano (antes do evento `correction`): cada versão depois da
 * primeira é uma correção. Pedido do PR entre a versão anterior e esta (texto "Pedido de mudança no PR",
 * vindo do GitHub, ou um turno numa etapa do PR — o pedido pelo botão do app) → PR; a mesa saiu do
 * planejamento nesse intervalo sem chegar ao PR → prévia; senão → plano.
 */
export function classifyLegacyCorrections(planTimes: readonly number[], turns: readonly { ts: number; stage: string }[], prRequests: readonly number[]): CorrectionCounts {
    const counts: CorrectionCounts = { plan: 0, preview: 0, pr: 0 }
    const times = [...planTimes].sort((a, b) => a - b)
    for (let index = 1; index < times.length; index++) {
        const start = times[index - 1]!
        const end = times[index]!
        const inInterval = (ts: number) => ts > start && ts <= end
        if (prRequests.some(inInterval) || turns.some((turn) => inInterval(turn.ts) && PR_STAGES.has(turn.stage))) counts.pr++
        else if (turns.some((turn) => turn.ts > start && turn.ts <= end && POST_PLAN_STAGES.has(turn.stage))) counts.preview++
        else counts.plan++
    }
    return counts
}

/** Correções exatas (eventos) depois de `since`, mais a classificação retroativa das versões anteriores. */
export function mergeCorrections(planTimes: readonly number[], legacy: (times: readonly number[]) => CorrectionCounts, events: readonly { at: number; kind: CorrectionKind }[], since: number | null): CorrectionCounts {
    if (since === null) return legacy(planTimes)
    const before = planTimes.filter((ts) => ts < since)
    // A versão que fecha o intervalo da primeira correção exata ainda pode ser anterior a `since`.
    const counts = legacy(before)
    for (const event of events) if (event.at >= since) counts[event.kind]++
    return counts
}

export interface DeveloperWorkbenchFacts {
    id: string
    completedAt: number
    startedAt: number
    mergedAt: number | null
    planVersions: number
    corrections: CorrectionCounts
    reopened: boolean
    regressionFinding: boolean
    blocked: boolean
    lesson: boolean
    conflict: boolean
    ciFailed: boolean
    ciFixed: boolean
    interrupted: boolean
    resumed: boolean
    retried: boolean
    costUsd: number | null
    tokens: number | null
    /** Duração (ms) por etapa, dos eventos `stage-entered` (só mesas com o registro). */
    stageDurations: Record<string, number> | null
}

export const DEVELOPER_PERCENT_KEYS = ["regression", "reopened", "regressionFinding", "previewCorrection", "blocked", "lesson", "oneShot", "conflict", "ciFailed", "ciFixed", "interrupted", "resumed", "retried"] as const
export type DeveloperPercentKey = (typeof DEVELOPER_PERCENT_KEYS)[number]

/** As cinco da issue vêm marcadas na legenda; as demais começam desmarcadas. */
export const DEVELOPER_DEFAULT_LINES: readonly DeveloperPercentKey[] = ["regression", "blocked", "lesson", "oneShot", "conflict"]

/** Marcas de uma mesa para as porcentagens. */
export function developerFlags(facts: DeveloperWorkbenchFacts): Record<DeveloperPercentKey, boolean> {
    const previewCorrection = facts.corrections.preview > 0
    return {
        regression: facts.reopened || facts.regressionFinding || previewCorrection,
        reopened: facts.reopened,
        regressionFinding: facts.regressionFinding,
        previewCorrection,
        blocked: facts.blocked,
        lesson: facts.lesson,
        oneShot: facts.planVersions <= 1 && facts.corrections.plan + facts.corrections.preview + facts.corrections.pr === 0,
        conflict: facts.conflict,
        ciFailed: facts.ciFailed,
        ciFixed: facts.ciFailed && facts.ciFixed,
        interrupted: facts.interrupted,
        resumed: facts.resumed,
        retried: facts.retried,
    }
}

export interface DeveloperSince {
    /** Interrupção, retomada, CI corrigido e tempo por etapa não são retroativos. */
    interrupted: number | null
    resumed: number | null
    ciFixed: number | null
    stages: number | null
}

export interface DeveloperSummary {
    base: number
    percents: Record<DeveloperPercentKey, number | null>
    cyclesPerWorkbench: number | null
    hoursToMerge: number | null
    costPerWorkbench: number | null
    tokensPerWorkbench: number | null
    stageHours: { stage: string; hours: number }[]
    series: MetricPointDto[]
}

/** Resumo do período: porcentagens (base = mesas concluídas), médias e a série do gráfico. */
export function summarizeDeveloper(items: readonly DeveloperWorkbenchFacts[], ctx: BucketContext, since: DeveloperSince): DeveloperSummary {
    const flags = items.map((item) => ({ item, flags: developerFlags(item) }))
    const after = (start: number | null) => (start === null ? flags : flags.filter(({ item }) => item.completedAt >= start))
    const rate = (key: DeveloperPercentKey, list = flags) => pct(list.filter((entry) => entry.flags[key]).length, list.length)
    const ciBase = after(since.ciFixed).filter(({ flags: f }) => f.ciFailed)
    const percents = Object.fromEntries(DEVELOPER_PERCENT_KEYS.map((key) => [key, rate(key)])) as Record<DeveloperPercentKey, number | null>
    percents.interrupted = rate("interrupted", after(since.interrupted))
    percents.resumed = rate("resumed", after(since.resumed))
    percents.ciFixed = pct(ciBase.filter(({ flags: f }) => f.ciFixed).length, ciBase.length)

    const stageTotals = new Map<string, number[]>()
    for (const item of items) {
        if (!item.stageDurations || (since.stages !== null && item.startedAt < since.stages)) continue
        for (const [stage, ms] of Object.entries(item.stageDurations)) stageTotals.set(stage, [...(stageTotals.get(stage) ?? []), ms])
    }
    const merged = items.filter((item) => item.mergedAt !== null && item.mergedAt >= item.startedAt)
    const costs = items.map((item) => item.costUsd).filter((value): value is number => typeof value === "number" && value > 0)
    const tokens = items.map((item) => item.tokens).filter((value): value is number => typeof value === "number" && value > 0)

    const series = percentSeries(
        flags.map(({ item, flags: f }) => ({ at: item.completedAt, flags: f })),
        DEVELOPER_PERCENT_KEYS,
        ctx,
        { interrupted: since.interrupted, resumed: since.resumed, ciFixed: since.ciFixed },
    )
    // "% de CI corrigido" é sobre as mesas com CI falho do bucket, não sobre todas.
    const ciPoints = percentSeries(
        ciBase.map(({ item, flags: f }) => ({ at: item.completedAt, flags: { ciFixed: f.ciFixed } })),
        ["ciFixed"] as const,
        ctx,
        { ciFixed: since.ciFixed },
    )
    series.forEach((point, index) => (point.ciFixed = ciPoints[index]?.ciFixed ?? null))

    return {
        base: items.length,
        percents,
        cyclesPerWorkbench: avg(items.map((item) => item.corrections.plan + item.corrections.preview + item.corrections.pr)),
        hoursToMerge: avg(merged.map((item) => (item.mergedAt! - item.startedAt) / 3_600_000)),
        costPerWorkbench: avg(costs),
        tokensPerWorkbench: avg(tokens),
        stageHours: [...stageTotals.entries()].map(([stage, values]) => ({ stage, hours: avg(values)! / 3_600_000 })).sort((a, b) => b.hours - a.hours),
        series,
    }
}

/**
 * Duração por etapa a partir das entradas de etapa (ordenadas): cada etapa dura até a entrada da
 * seguinte; a última (concluída) não conta. Entradas repetidas da mesma etapa são somadas.
 */
export function stageDurations(entries: readonly { at: number; stage: string }[], endAt: number): Record<string, number> | null {
    const sorted = [...entries].sort((a, b) => a.at - b.at)
    if (!sorted.length) return null
    const out: Record<string, number> = {}
    for (let index = 0; index < sorted.length; index++) {
        const current = sorted[index]!
        if (current.stage === "done") continue
        const next = sorted[index + 1]?.at ?? endAt
        if (next <= current.at) continue
        out[current.stage] = (out[current.stage] ?? 0) + (next - current.at)
    }
    return out
}
