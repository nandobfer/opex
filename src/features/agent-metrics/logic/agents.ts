import { avg, countBy, pct } from "./common"

/** Regras puras das métricas dos demais agentes (OPE-122). Ver `aicontext/modules/agent-metrics.md`. */

// ── Orçamentista ─────────────────────────────────────────────────────────────

/**
 * Erro da estimativa da IA contra as horas reais, só em tarefas concluídas: |real − estimada| ÷
 * estimada. Sem estimativa, estimativa 0 ou sem horas reais, a tarefa fica fora (sem divisão por zero).
 */
export function estimateErrors(tasks: readonly { estimatedHours: number | null | undefined; realHours: number | null | undefined }[]): number[] {
    return tasks
        .filter((task) => typeof task.estimatedHours === "number" && task.estimatedHours > 0 && typeof task.realHours === "number" && task.realHours > 0)
        .map((task) => Math.abs(task.realHours! - task.estimatedHours!) / task.estimatedHours!)
}

export function summarizeEstimates(tasks: readonly { estimatedHours: number | null | undefined; realHours: number | null | undefined }[], marginPercent: number) {
    const errors = estimateErrors(tasks)
    return {
        base: errors.length,
        meanErrorPercent: errors.length ? avg(errors)! * 100 : null,
        withinMarginPercent: pct(errors.filter((error) => error <= marginPercent / 100).length, errors.length),
    }
}

/** Orçamentos: base = rascunhos do portal com prévia gerada; aprovados = viraram tarefa; corrigidos = pedido de correção. */
export function summarizeBudgets(drafts: readonly { approved: boolean; corrected: boolean }[]) {
    return {
        base: drafts.length,
        approvedPercent: pct(drafts.filter((draft) => draft.approved).length, drafts.length),
        correctedPercent: pct(drafts.filter((draft) => draft.corrected).length, drafts.length),
    }
}

// ── Catalogador ──────────────────────────────────────────────────────────────

export function summarizeCatalog(tasks: readonly { summary: string | null | undefined; tags: readonly string[] | null | undefined }[]) {
    const tagsOf = (task: { tags: readonly string[] | null | undefined }) => task.tags ?? []
    return {
        base: tasks.length,
        summaryPercent: pct(tasks.filter((task) => Boolean(task.summary?.trim())).length, tasks.length),
        tagsPercent: pct(tasks.filter((task) => tagsOf(task).length > 0).length, tasks.length),
        tagsPerTask: avg(tasks.map((task) => tagsOf(task).length)),
        topTags: countBy(tasks.flatMap((task) => tagsOf(task).map((tag) => ({ tag }))), (item) => item.tag).slice(0, 10),
    }
}

// ── Refinador ────────────────────────────────────────────────────────────────

export interface RefinementFacts {
    refinementId: string
    startedAt: number
    completed: boolean
    abandoned: boolean
    questions: number
    durationMs: number | null
}

/**
 * Refinamentos iniciados no período. Concluído = chegou à especificação final; abandonado = apagado
 * (recomeço ou exclusão) antes dela. Os que ainda estão em andamento ficam fora da taxa.
 */
export function summarizeRefinements(items: readonly RefinementFacts[]) {
    const finished = items.filter((item) => item.completed || item.abandoned)
    const done = items.filter((item) => item.completed)
    return {
        base: items.length,
        completedPercent: pct(done.length, finished.length),
        questionsPerRefinement: avg(items.map((item) => item.questions)),
        hoursToSpec: avg(done.map((item) => item.durationMs).filter((value): value is number => typeof value === "number").map((ms) => ms / 3_600_000)),
    }
}

// ── Adversário ───────────────────────────────────────────────────────────────

export interface AdversarialRoundFacts {
    workbenchId: string
    at: number
    blocked: boolean
    decision: string | null
    categories: readonly string[]
}

/** Rodada bloqueante = ao menos um achado bloqueante; ignorado = o dono seguiu sem corrigir (`skipped`). */
export function summarizeAdversarial(rounds: readonly AdversarialRoundFacts[]) {
    const blocked = rounds.filter((round) => round.blocked)
    const perWorkbench = new Map<string, number>()
    for (const round of rounds) perWorkbench.set(round.workbenchId, (perWorkbench.get(round.workbenchId) ?? 0) + 1)
    return {
        base: rounds.length,
        blockedPercent: pct(blocked.length, rounds.length),
        ignoredPercent: pct(blocked.filter((round) => round.decision === "skipped").length, blocked.length),
        roundsPerWorkbench: avg([...perWorkbench.values()]),
        categories: countBy(rounds.flatMap((round) => round.categories.map((category) => ({ category }))), (item) => item.category),
    }
}

// ── Revisor ──────────────────────────────────────────────────────────────────

export interface ReviewFacts {
    id: string
    prKey: string
    at: number
    state: string
    verdict: string | null
    findings: number | null
    durationMs: number | null
    /** Destino do PR: mergeado, fechado sem merge ou aberto/desconhecido. */
    prOutcome: "merged" | "closed" | "open"
    /** Replanejamento ligado a esta revisão (evento exato). */
    replannedExact: boolean
    /** Aproximação para o passado: o PR teve replanejamento automático (contador da mesa). */
    replannedApprox: boolean
    /** É a primeira revisão concluída do PR em todo o histórico (não só a primeira do período). */
    firstOfPr: boolean
}

/**
 * Sugestão aceita = revisão com pedido de mudança seguida de "Replanejar com o pedido do PR";
 * descartada = o PR foi mergeado sem isso; PR fechado sem merge não entra. Antes de `exactSince`
 * vale a aproximação por PR.
 */
export function suggestionOutcome(review: ReviewFacts, exactSince: number | null): "accepted" | "discarded" | null {
    if (review.verdict !== "changes_requested") return null
    const exact = exactSince !== null && review.at >= exactSince
    const replanned = exact ? review.replannedExact : review.replannedExact || review.replannedApprox
    if (replanned) return "accepted"
    if (review.prOutcome === "merged") return "discarded"
    return null
}

export function summarizeReviews(reviews: readonly ReviewFacts[], exactSince: number | null) {
    const finished = reviews.filter((review) => review.state === "done" || review.state === "failed" || review.state === "interrupted")
    const done = finished.filter((review) => review.state === "done")
    const firsts = done.filter((review) => review.firstOfPr)
    const outcomes = done.map((review) => suggestionOutcome(review, exactSince)).filter((value): value is "accepted" | "discarded" => value !== null)
    return {
        base: finished.length,
        firstApprovalPercent: pct(firsts.filter((review) => review.verdict === "approved").length, firsts.length),
        findingsPerReview: avg(done.map((review) => review.findings).filter((value): value is number => typeof value === "number")),
        acceptedPercent: pct(outcomes.filter((value) => value === "accepted").length, outcomes.length),
        durationMinutes: avg(finished.map((review) => review.durationMs).filter((value): value is number => typeof value === "number" && value > 0).map((ms) => ms / 60_000)),
        failurePercent: pct(finished.filter((review) => review.state !== "done").length, finished.length),
    }
}

// ── Mentor ───────────────────────────────────────────────────────────────────

/**
 * Execuções do Mentor. As antigas gravam uma memória cada (`created`/`updated`); o aprendizado na conclusão
 * (OPE-165, `learned`) aplica várias operações: as contagens vêm de `operations` e o destino de `targetCounts`.
 */
export function summarizeMentor(runs: readonly { status: string; target: string | null; operations?: Partial<Record<string, number>> | null; targetCounts?: Record<string, number> | null }[]) {
    const finished = runs.filter((run) => !["queued", "running"].includes(run.status))
    const lessons = finished.filter((run) => run.status === "created" || run.status === "updated" || run.status === "learned")
    const dropped = finished.filter((run) => run.status === "discarded" || run.status === "skipped")
    const targets = new Map<string, number>()
    for (const run of lessons) {
        const counts = run.status === "learned" ? Object.entries(run.targetCounts ?? {}) : [[run.target ?? "adversarial", 1] as const]
        for (const [key, count] of counts) targets.set(key, (targets.get(key) ?? 0) + count)
    }
    const sum = (pick: (run: (typeof finished)[number]) => number) => finished.reduce((total, run) => total + pick(run), 0)
    return {
        base: finished.length,
        lessonPercent: pct(lessons.length, lessons.length + dropped.length),
        created: sum((run) => (run.status === "created" ? 1 : (run.operations?.create ?? 0))),
        updated: sum((run) => (run.status === "updated" ? 1 : (run.operations?.update ?? 0) + (run.operations?.merge ?? 0))),
        archived: sum((run) => (run.operations?.archive ?? 0)),
        failurePercent: pct(finished.filter((run) => run.status === "failed").length, finished.length),
        targets: [...targets.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    }
}

// ── Opex e Maddox ────────────────────────────────────────────────────────────

export function summarizeConversations(conversations: readonly { scope: string; messages: number; tools: readonly { name: string; calls: number; failures: number }[]; confirmed: number; cancelled: number; inputTokens: number; outputTokens: number; costUsd: number | null }[]) {
    const tools = new Map<string, { calls: number; failures: number }>()
    for (const conversation of conversations)
        for (const tool of conversation.tools) {
            const hit = tools.get(tool.name) ?? { calls: 0, failures: 0 }
            hit.calls += tool.calls
            hit.failures += tool.failures
            tools.set(tool.name, hit)
        }
    const confirmed = conversations.reduce((total, item) => total + item.confirmed, 0)
    const cancelled = conversations.reduce((total, item) => total + item.cancelled, 0)
    const costs = conversations.map((item) => item.costUsd).filter((value): value is number => typeof value === "number")
    return {
        base: conversations.length,
        owner: conversations.filter((item) => item.scope === "owner").length,
        portal: conversations.filter((item) => item.scope === "portal").length,
        messagesPerConversation: avg(conversations.map((item) => item.messages)),
        confirmedPercent: pct(confirmed, confirmed + cancelled),
        tokensPerConversation: avg(conversations.map((item) => item.inputTokens + item.outputTokens)),
        costPerConversation: costs.length ? avg(costs) : null,
        tools: [...tools.entries()].map(([name, value]) => ({ name, ...value, failurePercent: pct(value.failures, value.calls) })).sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)),
    }
}

// ── Arquiteto ────────────────────────────────────────────────────────────────

export function summarizeDiagrams(diagrams: readonly { nodes: number; edges: number; durationMs: number | null }[]) {
    return {
        base: diagrams.length,
        nodes: avg(diagrams.map((item) => item.nodes)),
        edges: avg(diagrams.map((item) => item.edges)),
        durationMinutes: avg(diagrams.map((item) => item.durationMs).filter((value): value is number => typeof value === "number" && value > 0).map((ms) => ms / 60_000)),
    }
}
