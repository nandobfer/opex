import { dbConnect } from "@/lib/db"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { githubPaginate, githubRequest } from "@/features/github/client"
import { prMergeReady } from "../logic"
import { formatPrFeedback } from "../prompts"
import { centralLogger } from "./log"
import { closeOrphanWorkPeriods } from "./timer-sync"
import { handlePrAutoMerge, handlePrClosed, handlePrConflict, handlePrFeedback, handlePrMerged, handlePrReopened, savePrCursors } from "./workflow"

/**
 * Rotina "Acompanhar PRs do desenvolvimento agêntico" (Integrações › Crons): para cada mesa com PR
 * aberto, consulta o GitHub — merge conclui a mesa; comentário novo com `@opex` (na conversa, na
 * linha ou no corpo de uma revisão) ou revisão pedindo mudanças volta ao planejamento; merge
 * bloqueado por conflito aciona a resolução automática no próprio PR.
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

export async function watchPullRequests(): Promise<string> {
    await dbConnect()
    const closedOrphans = await closeOrphanWorkPeriods().catch(() => 0)
    const docs = await AgenticWorkbench.find({ stage: "pr_open", runState: { $ne: "running" }, pr: { $ne: null } }).lean()
    let merged = 0
    let replans = 0
    let conflicts = 0
    let autoMerges = 0
    let failures = 0
    for (const doc of docs) {
        const id = String(doc._id)
        const pr = doc.pr!
        const repo = repoFromPrUrl(pr.url)
        const log = centralLogger(doc.centralId, doc.taskCode)
        if (!repo) continue
        try {
            const pull = await githubRequest<GithubPull>(`/repos/${repo}/pulls/${pr.number}`)
            if (pull.merged) {
                log.success(`PR #${pr.number} mergeado`, { workbenchId: id })
                await handlePrMerged(id, { mergedAt: pull.merged_at ? new Date(pull.merged_at) : new Date(), mergeCommitSha: pull.merge_commit_sha })
                merged++
                continue
            }
            if (pull.state === "closed") {
                await handlePrClosed(id)
                continue
            }
            if (pr.state === "closed") await handlePrReopened(id)

            const lastReviewId = pr.lastReviewId ?? 0
            // Mesa aberta antes desta rotina conhecer comentários: a 1ª varredura só grava o cursor (não replaneja por comentários antigos).
            const baseline = pr.lastCommentId === undefined
            const lastCommentId = pr.lastCommentId ?? 0
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
                await savePrCursors(id, {
                    lastReviewId: freshReviews.length ? Math.max(...freshReviews.map((review) => review.id)) : lastReviewId,
                    lastCommentId: Math.max(lastCommentId, ...freshIssue.map((comment) => comment.id), ...freshLine.map((comment) => comment.id)),
                })

                // Revisões novas: pedindo mudanças (comportamento mantido) ou mencionando `@opex` no corpo.
                const relevantReviews = freshReviews.filter((review) => review.state === "CHANGES_REQUESTED" || mentionsOpex(review.body ?? ""))
                const expanded = new Set(relevantReviews.map((review) => review.id))
                const sections: PrFeedbackSection[] = await Promise.all(
                    relevantReviews.map(async (review) => {
                        const comments = await githubPaginate<GithubReviewComment>(`/repos/${repo}/pulls/${pr.number}/reviews/${review.id}/comments?per_page=100`, { maxPages: 3 }).catch(() => [])
                        return {
                            author: review.user?.login ?? null,
                            body: review.body ?? "",
                            comments: comments.map((comment) => ({ path: comment.path, line: comment.line ?? comment.original_line ?? null, body: comment.body })),
                        }
                    }),
                )
                if (!baseline) {
                    // Comentários soltos (conversa e linha) que mencionam `@opex`; os de linha de uma revisão já expandida ficam de fora.
                    for (const comment of freshIssue) if (mentionsOpex(comment.body)) sections.push({ author: comment.user?.login ?? null, body: comment.body, comments: [] })
                    for (const comment of freshLine) {
                        if (expanded.has(comment.pull_request_review_id ?? -1) || !mentionsOpex(comment.body)) continue
                        sections.push({ author: comment.user?.login ?? null, body: "", comments: [{ path: comment.path, line: comment.line ?? comment.original_line ?? null, body: comment.body }] })
                    }
                }

                const feedback = formatPrFeedback(sections)
                // Revisão sem texto continua indo para `changes_requested` (a mesa pede o motivo ao usuário).
                if (relevantReviews.length || feedback.trim()) {
                    log.warn(`PR #${pr.number}: pedido de mudança (comentário ou revisão)`, { workbenchId: id })
                    await handlePrFeedback(id, feedback)
                    replans++
                    replanned = true
                }
            }
            // O feedback tem prioridade: não inicia a resolução de conflito na mesma varredura em que replanejou.
            if (replanned) continue

            // Merge bloqueado por conflito: aciona a resolução automática no próprio PR (sem aprovação).
            if (pull.mergeable === false && conflictUntried(pr, pull)) {
                log.warn(`PR #${pr.number}: conflito de merge — resolvendo automaticamente`, { workbenchId: id })
                const started = await handlePrConflict(id, {
                    baseBranch: pull.base?.ref ?? "a branch de destino",
                    headBranch: pull.head?.ref ?? doc.branch ?? "a branch do PR",
                    baseSha: pull.base?.sha ?? "",
                    headSha: pull.head?.sha ?? "",
                })
                if (started) conflicts++
                continue
            }

            // Merge automático (OPE-50): a central pode mandar o agente mergear o próprio PR.
            // Só quando o PR está pronto (sem conflito, sem bloqueios e fora do rascunho); a mesa segue
            // elegível enquanto o GitHub não liberar as verificações/regras.
            if (prMergeReady({ mergeable: pull.mergeable, mergeableState: pull.mergeable_state, draft: pull.draft })) {
                const started = await handlePrAutoMerge(id, { baseBranch: pull.base?.ref ?? "a branch de destino" })
                if (started) autoMerges++
            }
        } catch (error) {
            failures++
            log.error(`Falha ao consultar o PR #${pr.number}`, error, { workbenchId: id })
        }
    }
    return `${docs.length} PR(s) acompanhado(s); ${merged} mergeado(s); ${replans} com pedido de mudança${conflicts ? `; ${conflicts} com conflito em resolução` : ""}${autoMerges ? `; ${autoMerges} com merge automático iniciado` : ""}${failures ? `; ${failures} com falha` : ""}${closedOrphans ? `; ${closedOrphans} apontamento(s) encerrado(s)` : ""}`
}
