import { dbConnect } from "@/lib/db"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { githubPaginate, githubRequest } from "@/features/github/client"
import { formatReviewFeedback } from "../prompts"
import { centralLogger } from "./log"
import { handlePrChangesRequested, handlePrClosed, handlePrMerged, handlePrReopened, saveLastReviewId } from "./workflow"

/**
 * Rotina "Acompanhar PRs do desenvolvimento agêntico" (Integrações › Crons): para cada mesa com PR
 * aberto, consulta o GitHub — merge conclui a mesa; revisão pedindo mudanças volta ao planejamento.
 */

interface GithubPull {
    state: "open" | "closed"
    merged: boolean
    merged_at: string | null
    merge_commit_sha: string | null
}

interface GithubReview {
    id: number
    state: string
    body: string | null
    user: { login: string } | null
}

interface GithubReviewComment {
    body: string
    path: string | null
    line: number | null
    original_line?: number | null
}

/** `https://github.com/org/repo/pull/12` → `org/repo`. */
export function repoFromPrUrl(url: string): string | null {
    const match = /github\.com\/([\w.-]+\/[\w.-]+)\/pull\/\d+/.exec(url)
    return match ? match[1]! : null
}

export async function watchPullRequests(): Promise<string> {
    await dbConnect()
    const docs = await AgenticWorkbench.find({ stage: "pr_open", runState: { $ne: "running" }, pr: { $ne: null } }).lean()
    let merged = 0
    let replans = 0
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

            const reviews = await githubPaginate<GithubReview>(`/repos/${repo}/pulls/${pr.number}/reviews?per_page=100`, { maxPages: 5 })
            const fresh = reviews.filter((review) => review.id > (pr.lastReviewId ?? 0))
            if (!fresh.length) continue
            await saveLastReviewId(id, Math.max(...fresh.map((review) => review.id)))
            const changes = fresh.filter((review) => review.state === "CHANGES_REQUESTED")
            if (!changes.length) continue
            const detailed = await Promise.all(
                changes.map(async (review) => {
                    const comments = await githubPaginate<GithubReviewComment>(`/repos/${repo}/pulls/${pr.number}/reviews/${review.id}/comments?per_page=100`, { maxPages: 3 }).catch(() => [])
                    return {
                        author: review.user?.login ?? null,
                        body: review.body ?? "",
                        comments: comments.map((comment) => ({ path: comment.path, line: comment.line ?? comment.original_line ?? null, body: comment.body })),
                    }
                }),
            )
            log.warn(`Revisão do PR #${pr.number} pediu mudanças`, { workbenchId: id })
            await handlePrChangesRequested(id, formatReviewFeedback(detailed))
            replans++
        } catch (error) {
            failures++
            log.error(`Falha ao consultar o PR #${pr.number}`, error, { workbenchId: id })
        }
    }
    return `${docs.length} PR(s) acompanhado(s); ${merged} mergeado(s); ${replans} com mudanças pedidas${failures ? `; ${failures} com falha` : ""}`
}
