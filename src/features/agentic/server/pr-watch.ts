import { dbConnect } from "@/lib/db"
import { AgenticCentral, AgenticWorkbench } from "@/lib/db/models/Agentic"
import { githubPaginate, githubRequest } from "@/features/github/client"
import { parseCentralConfig, prMergeReady, resolveCentralCi } from "../logic"
import { CI_CHECK_MERGE_STATES, ciFailureState, ciFixDecision, describeCiState, type CiResult, type GithubCheckRun, type GithubCommitStatus } from "../ci"
import { DEFAULT_AGENTIC_CI, type AgenticCi } from "../schemas"
import { formatPrFeedback } from "../prompts"
import { centralLogger } from "./log"
import { closeOrphanWorkPeriods } from "./timer-sync"
import { loadAgenticSettings } from "./settings"
import { handlePrAutoMerge, handlePrCiFailure, handlePrCiLimit, handlePrClosed, handlePrConflict, handlePrFeedback, handlePrMerged, handlePrReopened, savePrCursors } from "./workflow"
import { loadPrReviewGate, type PrReviewStatus } from "@/features/pr-review/server/gate"
import { startPrWatchReport } from "./pr-watch-report"
import { loadPrWatchSchedule } from "./pr-watch-schedule"
import { isAutoReviewText } from "@/features/pr-review/logic"

/**
 * Rotina "Acompanhar PRs do desenvolvimento agêntico" (Integrações › Crons): para cada mesa com PR
 * aberto, consulta o GitHub — merge conclui a mesa; comentário novo com `@opex` (na conversa, na
 * linha ou no corpo de uma revisão) ou revisão pedindo mudanças volta ao planejamento; merge
 * bloqueado por conflito aciona a resolução automática no próprio PR; CI falho (todas as verificações
 * terminadas) aciona a correção automática, quando a central permite. Prioridade: feedback →
 * conflito → CI → merge automático. Cada varredura de uma mesa vira um bloco "Verificação do PR #N"
 * na saída da mesa (`pr-watch-report.ts`).
 */

interface GithubRef {
    ref: string
    sha: string
}

interface GithubPull {
    state: "open" | "closed"
    merged: boolean
    merged_at: string | null
    merge_commit_sha: string | null
    /** `false` = conflito de merge (`null` = o GitHub ainda está calculando). */
    mergeable?: boolean | null
    /** Estado de verificações/regras: `clean`, `blocked`, `unstable`, `dirty`, `behind`, `unknown`… */
    mergeable_state?: string | null
    /** PR ainda como rascunho (não pode ser mergeado automaticamente). */
    draft?: boolean | null
    base?: GithubRef | null
    head?: GithubRef | null
}

interface GithubUserRef {
    login: string
}

interface GithubReview {
    id: number
    state: string
    body: string | null
    user: GithubUserRef | null
}

interface GithubReviewComment {
    id: number
    body: string
    user: GithubUserRef | null
    path: string | null
    line: number | null
    original_line?: number | null
    pull_request_review_id: number | null
}

interface GithubIssueComment {
    id: number
    body: string
    user: GithubUserRef | null
}

/** Seção de feedback do PR: corpo de uma revisão ou de um comentário + comentários de linha. */
interface PrFeedbackSection {
    author: string | null
    body: string
    comments: { path: string | null; line: number | null; body: string }[]
    /** Feedback publicado pela revisão automática (marcador oculto). */
    auto?: boolean
}

/** `https://github.com/org/repo/pull/12` → `org/repo`. */
export function repoFromPrUrl(url: string): string | null {
    const match = /github\.com\/([\w.-]+\/[\w.-]+)\/pull\/\d+/.exec(url)
    return match ? match[1]! : null
}

/** O texto menciona `@opex` (fronteira de menção: não casa `@opexa`, `@opex-dev` nem `foo@opex.com`). */
export function mentionsOpex(text: string): boolean {
    return /(?:^|[^\w@])@opex(?![\w-])/i.test(text)
}

/**
 * Ainda não tentamos resolver ESTE estado do PR? Compara os SHAs (base e head) salvos na última
 * resolução: um push (novo head) ou uma base nova libera outra tentativa; o mesmo estado não repete.
 */
export function conflictUntried(pr: { conflictBaseSha?: string | null; conflictHeadSha?: string | null }, pull: { base?: GithubRef | null; head?: GithubRef | null }): boolean {
    const head = pull.head?.sha
    if (!head) return false
    return (pr.conflictBaseSha ?? null) !== (pull.base?.sha ?? null) || (pr.conflictHeadSha ?? null) !== head
}

const MERGE_STATE_LABELS: Record<string, string> = {
    clean: "pronto para merge (clean)",
    has_hooks: "pronto para merge (has_hooks)",
    behind: "atrás da branch de destino (behind)",
    blocked: "bloqueado por verificações ou revisões obrigatórias (blocked)",
    unstable: "verificações com falha ou pendentes (unstable)",
    dirty: "com conflito (dirty)",
    draft: "rascunho (draft)",
    unknown: "ainda sendo calculado pelo GitHub (unknown)",
}

const mergeStateLabel = (state: string | null | undefined) => (state ? (MERGE_STATE_LABELS[state] ?? state) : MERGE_STATE_LABELS.unknown!)

/** Estado do PR aberto em texto (passo da verificação). */
export function describePull(pull: Pick<GithubPull, "draft" | "mergeable_state">): string {
    return `PR aberto${pull.draft ? " (rascunho)" : ""} · estado de merge: ${mergeStateLabel(pull.mergeable_state)}`
}

/** Por que o PR ainda não está pronto para o merge automático. */
export function mergeWaitReason(pull: Pick<GithubPull, "draft" | "mergeable" | "mergeable_state">): string {
    if (pull.draft) return "o PR está como rascunho"
    if (pull.mergeable === false) return "há conflito de merge"
    if (pull.mergeable == null) return "o GitHub ainda está calculando o estado de merge"
    return `o GitHub ainda não liberou o merge (${mergeStateLabel(pull.mergeable_state)})`
}

/** Estado da revisão automática do commit atual em texto (só o estado, sem a saída do revisor). */
export function describeReviewStatus(status: PrReviewStatus, headSha: string | null | undefined): string {
    if (!status.enabled) return "Revisão automática de PR desligada"
    const prefix = `Revisão automática${headSha ? ` do commit ${headSha.slice(0, 7)}` : ""}`
    if (!status.state) return `${prefix}: ainda não revisado`
    switch (status.state) {
        case "queued":
            return `${prefix}: na fila`
        case "running":
            return `${prefix}: revisando`
        case "done":
            return `${prefix}: ${status.verdict === "approved" ? "aprovou" : status.verdict === "changes_requested" ? "pediu mudanças" : "comentou"}`
        case "failed":
            return `${prefix}: falhou`
        case "interrupted":
            return `${prefix}: interrompida`
        default:
            return `${prefix}: ${status.state}`
    }
}

/**
 * Verificações (CI) do PR em texto quando elas não são consultadas (sem indício de falha ou correção
 * desligada): só relata o que o estado de merge do GitHub indica (`unstable` = com falha ou pendentes).
 */
export function describeChecks(pull: Pick<GithubPull, "mergeable_state">): { text: string; level: "info" | "warn" } | null {
    if (pull.mergeable_state === "unstable") return { text: "Verificações (CI) com falha ou pendentes", level: "warn" }
    return null
}

/** Verificações do commit (check runs + status de commit) resumidas no estado do CI. */
export async function fetchCiState(repo: string, sha: string): Promise<CiResult> {
    const [checks, combined] = await Promise.all([
        githubRequest<{ check_runs?: GithubCheckRun[] }>(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`),
        githubRequest<{ statuses?: GithubCommitStatus[] }>(`/repos/${repo}/commits/${sha}/status`),
    ])
    return ciFailureState(checks.check_runs ?? [], combined.statuses ?? [])
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export async function watchPullRequests(): Promise<string> {
    await dbConnect()
    const closedOrphans = await closeOrphanWorkPeriods().catch(() => 0)
    const docs = await AgenticWorkbench.find({ stage: "pr_open", runState: { $ne: "running" }, pr: { $ne: null } }).lean()
    const centrals = docs.length ? await AgenticCentral.find({ _id: { $in: [...new Set(docs.map((doc) => doc.centralId))] } }).lean() : []
    const globalCi = centrals.length ? (await loadAgenticSettings()).settings.ci : DEFAULT_AGENTIC_CI
    const configOf = new Map(
        centrals.map((central) => {
            const git = parseCentralConfig(central.config).git
            return [String(central._id), { autoMerge: git.autoMerge, ci: resolveCentralCi(globalCi, git) }] as const
        }),
    )
    const gate = await loadPrReviewGate()
    // A rotina já avançou o `nextRunAt` ao começar: é o horário da próxima verificação.
    const nextCheckAt = docs.length ? ((await loadPrWatchSchedule().catch(() => null))?.nextCheckAt ?? null) : null
    let merged = 0
    let replans = 0
    let conflicts = 0
    let autoMerges = 0
    let ciFixes = 0
    let failures = 0
    for (const doc of docs) {
        const id = String(doc._id)
        const pr = doc.pr!
        const repo = repoFromPrUrl(pr.url)
        const log = centralLogger(doc.centralId, doc.taskCode)
        if (!repo) continue
        // Limpeza pós-merge aguardando vaga: o merge já foi tratado (não processa de novo).
        if (doc.pendingTurn && pr.state === "merged") continue
        const report = await startPrWatchReport(id, pr.number, nextCheckAt)
        try {
            report.step(`Consultando o PR #${pr.number} no GitHub…`)
            const pull = await githubRequest<GithubPull>(`/repos/${repo}/pulls/${pr.number}`)
            if (pull.merged) {
                report.step("PR mergeado no GitHub", "success")
                await report.finish("action", "PR mergeado → concluindo a mesa")
                log.success(`PR #${pr.number} mergeado`, { workbenchId: id })
                await handlePrMerged(id, { mergedAt: pull.merged_at ? new Date(pull.merged_at) : new Date(), mergeCommitSha: pull.merge_commit_sha })
                merged++
                continue
            }
            if (pull.state === "closed") {
                report.step("PR fechado sem merge", "warn")
                // O aviso sai uma vez; enquanto continuar fechado, a verificação é "sem novidade".
                await report.finish(pr.closedNotified ? "idle" : "action", pr.closedNotified ? "PR continua fechado: reabra o PR no GitHub ou exclua a mesa" : "PR fechado sem merge → avisando")
                await handlePrClosed(id)
                continue
            }
            let reopened = false
            if (pr.state === "closed") {
                report.step("PR reaberto no GitHub: voltando a acompanhar", "success")
                reopened = true
                await handlePrReopened(id)
            }
            report.step(describePull(pull))
            const idle = (summary: string) => report.finish(reopened ? "action" : "idle", reopened ? `PR reaberto · ${summary}` : summary)
            // Aguardando vaga: só merge/fechamento são tratados; comentários, conflito e merge automático ficam para depois da espera.
            if (doc.pendingTurn) {
                report.step("Mesa aguardando vaga na central: só merge e fechamento são verificados", "warn")
                await idle("Aguardando vaga")
                continue
            }

            const lastReviewId = pr.lastReviewId ?? 0
            // Mesa aberta antes desta rotina conhecer comentários: a 1ª varredura só grava o cursor (não replaneja por comentários antigos).
            const baseline = pr.lastCommentId === undefined
            const lastCommentId = pr.lastCommentId ?? 0
            report.step("Lendo revisões e comentários…")
            const [reviews, issueComments, reviewComments] = await Promise.all([
                githubPaginate<GithubReview>(`/repos/${repo}/pulls/${pr.number}/reviews?per_page=100`, { maxPages: 5 }),
                githubPaginate<GithubIssueComment>(`/repos/${repo}/issues/${pr.number}/comments?per_page=100`, { maxPages: 5 }),
                githubPaginate<GithubReviewComment>(`/repos/${repo}/pulls/${pr.number}/comments?per_page=100`, { maxPages: 5 }),
            ])
            const freshReviews = reviews.filter((review) => review.id > lastReviewId)
            const freshIssue = issueComments.filter((comment) => comment.id > lastCommentId)
            const freshLine = reviewComments.filter((comment) => comment.id > lastCommentId)
            let replanned = false
            if (freshReviews.length || freshIssue.length || freshLine.length) {
                report.step(`Novos: ${plural(freshReviews.length, "revisão", "revisões")}, ${plural(freshIssue.length + freshLine.length, "comentário", "comentários")}`)
                if (baseline && (freshIssue.length || freshLine.length)) report.step("Primeira leitura desta mesa: os comentários existentes foram marcados como lidos (não replanejam)")
                await savePrCursors(id, {
                    lastReviewId: freshReviews.length ? Math.max(...freshReviews.map((review) => review.id)) : lastReviewId,
                    lastCommentId: Math.max(lastCommentId, ...freshIssue.map((comment) => comment.id), ...freshLine.map((comment) => comment.id)),
                })

                // Revisões novas: pedindo mudanças (comportamento mantido) ou mencionando `@opex` no corpo.
                const autoReplans = pr.autoReviewReplans ?? 0
                const decision = gate.replan(autoReplans)
                let blockedAuto = false
                const relevantReviews = freshReviews.filter((review) => {
                    if (review.state !== "CHANGES_REQUESTED" && !mentionsOpex(review.body ?? "")) return false
                    if (isAutoReviewText(review.body) && !decision.allowed) {
                        blockedAuto = true
                        return false
                    }
                    return true
                })
                const expanded = new Set(relevantReviews.map((review) => review.id))
                const sections: PrFeedbackSection[] = await Promise.all(
                    relevantReviews.map(async (review) => {
                        const comments = await githubPaginate<GithubReviewComment>(`/repos/${repo}/pulls/${pr.number}/reviews/${review.id}/comments?per_page=100`, { maxPages: 3 }).catch(() => [])
                        return {
                            author: review.user?.login ?? null,
                            body: review.body ?? "",
                            comments: comments.map((comment) => ({ path: comment.path, line: comment.line ?? comment.original_line ?? null, body: comment.body })),
                            auto: isAutoReviewText(review.body),
                        }
                    }),
                )
                if (!baseline) {
                    // Comentários soltos (conversa e linha) que mencionam `@opex`; os de linha de uma revisão já expandida ficam de fora.
                    for (const comment of freshIssue) {
                        if (!mentionsOpex(comment.body)) continue
                        if (isAutoReviewText(comment.body) && !decision.allowed) {
                            blockedAuto = true
                            continue
                        }
                        sections.push({ author: comment.user?.login ?? null, body: comment.body, comments: [], auto: isAutoReviewText(comment.body) })
                    }
                    for (const comment of freshLine) {
                        if (expanded.has(comment.pull_request_review_id ?? -1) || !mentionsOpex(comment.body)) continue
                        sections.push({ author: comment.user?.login ?? null, body: "", comments: [{ path: comment.path, line: comment.line ?? comment.original_line ?? null, body: comment.body }] })
                    }
                }
                if (blockedAuto) {
                    log.warn(`PR #${pr.number}: pedido de mudança da revisão automática ignorado (${decision.reason})`, { workbenchId: id })
                    report.step(`Pedido de mudança da revisão automática ignorado (${decision.reason ?? "limite atingido"})`, "warn")
                }

                const feedback = formatPrFeedback(sections)
                // Revisão sem texto continua indo para `changes_requested` (a mesa pede o motivo ao usuário).
                if (relevantReviews.length || feedback.trim()) {
                    const authors = [...new Set(sections.map((section) => section.author).filter(Boolean))].map((author) => `@${author}`)
                    report.step(`Pedido de mudança encontrado${authors.length ? ` (${authors.join(", ")})` : ""}`, "warn")
                    await report.finish("action", feedback.trim() ? "Pedido de mudança → replanejando" : "Pedido de mudança sem texto → aguardando você descrever as mudanças")
                    log.warn(`PR #${pr.number}: pedido de mudança (comentário ou revisão)`, { workbenchId: id })
                    if (sections.some((section) => section.auto)) await savePrCursors(id, { autoReviewReplans: autoReplans + 1 })
                    await handlePrFeedback(id, feedback)
                    replans++
                    replanned = true
                } else {
                    report.step("Nenhum pede mudança nem menciona @opex")
                }
            } else {
                report.step("Sem revisões nem comentários novos")
            }
            // O feedback tem prioridade: não inicia a resolução de conflito na mesma varredura em que replanejou.
            if (replanned) continue

            const headSha = pull.head?.sha
            report.step(describeReviewStatus(await gate.reviewStatus(repo, pr.number, headSha), headSha))

            // Merge bloqueado por conflito: aciona a resolução automática no próprio PR (sem aprovação).
            if (pull.mergeable === false) {
                if (conflictUntried(pr, pull)) {
                    const baseBranch = pull.base?.ref ?? "a branch de destino"
                    report.step(`Conflito de merge com ${baseBranch}`, "warn")
                    await report.finish("action", "Conflito de merge → resolvendo automaticamente")
                    log.warn(`PR #${pr.number}: conflito de merge — resolvendo automaticamente`, { workbenchId: id })
                    const started = await handlePrConflict(id, {
                        baseBranch,
                        headBranch: pull.head?.ref ?? doc.branch ?? "a branch do PR",
                        baseSha: pull.base?.sha ?? "",
                        headSha: headSha ?? "",
                    })
                    if (started) conflicts++
                    continue
                }
                report.step("Conflito de merge já tentado neste estado: aguardando um novo push ou uma nova base", "warn")
            } else if (pull.mergeable == null) {
                report.step("O GitHub ainda está calculando se há conflito")
            } else {
                report.step("Sem conflito de merge", "success")
            }

            // CI falho: só consulta as verificações quando o GitHub indica bloqueio (ou para zerar a contagem quando o CI volta a passar).
            const ci: AgenticCi = configOf.get(doc.centralId)?.ci ?? DEFAULT_AGENTIC_CI
            const attempts = pr.ciFixAttempts ?? 0
            const ciSuspect = pull.mergeable === true && (CI_CHECK_MERGE_STATES as readonly string[]).includes(pull.mergeable_state ?? "")
            if (headSha && ((ci.fixCi && ciSuspect) || attempts > 0)) {
                let state: CiResult | null = null
                try {
                    state = await fetchCiState(repo, headSha)
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    log.warn(`PR #${pr.number}: não foi possível consultar o CI (${message})`, { workbenchId: id })
                    report.step(`Não foi possível consultar o CI: ${message}`, "warn")
                }
                if (state) {
                    const described = describeCiState(state, headSha)
                    report.step(described.text, described.level)
                    if ((state.state === "passed" || state.state === "none") && attempts > 0) {
                        await savePrCursors(id, { ciFixAttempts: 0, ciFixLimitNotified: false })
                        report.step("CI sem falhas: a contagem de correções automáticas foi zerada", "success")
                    }
                }
                if (state?.state === "failed") {
                    const decision = ciFixDecision(pr, ci, headSha, state.failures)
                    if (decision.action === "limit") {
                        report.step(`Limite de ${ci.ciFixLimit ?? 0} correção(ões) automática(s) de CI atingido: corrija manualmente`, "warn")
                        if (decision.notify) await handlePrCiLimit(id, { max: ci.ciFixLimit ?? 0 })
                    } else if (decision.action === "fix") {
                        report.step(`Corrigindo o CI automaticamente (tentativa ${decision.attempt}${ci.ciFixLimit !== null ? ` de ${ci.ciFixLimit}` : ""})`, "warn")
                        await report.finish("action", "CI falhou → corrigindo automaticamente")
                        log.warn(`PR #${pr.number}: CI falhou — corrigindo automaticamente`, { workbenchId: id })
                        const started = await handlePrCiFailure(id, { headBranch: pull.head?.ref ?? doc.branch ?? "a branch do PR", headSha, failures: state.failures, key: decision.key, rerunAllowed: decision.rerunAllowed, attempt: decision.attempt })
                        if (started) ciFixes++
                        continue
                    } else {
                        report.step(decision.reason === "handled" ? "Estas falhas já foram tratadas: aguardando um novo push ou o resultado da reexecução" : "Correção automática de CI desligada na central")
                    }
                }
            } else {
                const checks = describeChecks(pull)
                if (checks) report.step(ci.fixCi ? checks.text : `${checks.text} · correção automática desligada na central`, checks.level)
            }

            // Merge automático (OPE-50): a central pode mandar o agente mergear o próprio PR.
            // Só quando o PR está pronto (sem conflito, sem bloqueios e fora do rascunho); a mesa segue
            // elegível enquanto o GitHub não liberar as verificações/regras.
            // Com a revisão automática ligada, espera a revisão do commit atual (na fila, revisando ou pedindo mudanças).
            if (configOf.get(doc.centralId)?.autoMerge === false) {
                report.step("Merge automático desligado na central")
            } else if (!prMergeReady({ mergeable: pull.mergeable, mergeableState: pull.mergeable_state, draft: pull.draft })) {
                report.step(`Merge automático aguardando: ${mergeWaitReason(pull)}`)
            } else if (await gate.blocksAutoMerge(repo, pr.number, headSha)) {
                report.step(`Merge automático aguardando a revisão automática${headSha ? ` do commit ${headSha.slice(0, 7)}` : ""}`)
            } else {
                report.step("PR pronto para o merge automático", "success")
                await report.finish("action", "PR pronto → merge automático")
                const started = await handlePrAutoMerge(id, { baseBranch: pull.base?.ref ?? "a branch de destino" })
                if (started) autoMerges++
                continue
            }
            await idle("Nada a fazer")
        } catch (error) {
            failures++
            log.error(`Falha ao consultar o PR #${pr.number}`, error, { workbenchId: id })
            await report.fail(`Falha ao consultar o PR no GitHub: ${error instanceof Error ? error.message : String(error)}`)
        }
    }
    return `${docs.length} PR(s) acompanhado(s); ${merged} mergeado(s); ${replans} com pedido de mudança${conflicts ? `; ${conflicts} com conflito em resolução` : ""}${ciFixes ? `; ${ciFixes} com CI em correção` : ""}${autoMerges ? `; ${autoMerges} com merge automático iniciado` : ""}${failures ? `; ${failures} com falha` : ""}${closedOrphans ? `; ${closedOrphans} apontamento(s) encerrado(s)` : ""}`
}
