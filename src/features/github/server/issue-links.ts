import { dbConnect } from "@/lib/db"
import { GithubIssueLink, type IGithubIssueLink } from "@/lib/db/models/Github"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { logger } from "@/lib/logger"
import { isNonCodeTaskType, TASK_STATUSES, type TaskStatus } from "@/features/tasks/constants"
import type { TaskDto, TaskIssueRef } from "@/features/tasks/types"
import { githubPaginate, githubRequest } from "../client"
import { PENDING_COMMIT_MS } from "../constants"
import { htmlBaseOf, planIssueCommit, type GithubIssueLite } from "../logic"
import { publishBoardUpdated } from "./events"

/**
 * Vínculo issue ↔ tarefa do Go! Sipal: botão "Abrir issue", issue fechada → Validação (com o
 * commit que a fechou) e tarefa em Validação → fecha a issue. Somente servidor.
 */

const GITHUB_ACTOR = "github"

const toRef = (link: IGithubIssueLink): TaskIssueRef => ({ url: link.url, repo: link.repo, number: link.number, state: link.issueState, notice: link.notice ?? null })

/** Issues vinculadas às tarefas informadas (id da tarefa → issue). */
export async function issueRefsFor(taskIds: readonly string[]): Promise<Map<string, TaskIssueRef>> {
    if (taskIds.length === 0) return new Map()
    try {
        await dbConnect()
        const links = await GithubIssueLink.find({ goTaskId: { $in: [...taskIds] } }).lean()
        return new Map(links.map((link) => [link.goTaskId, toRef(link)]))
    } catch (error) {
        logger.warn({ err: error }, "[github] Vínculos de issues indisponíveis")
        return new Map()
    }
}

export interface IssueCommit {
    commitUrl: string
    pullRequestUrl: string | null
    source: string
}

interface RawPull {
    html_url: string
    merge_commit_sha?: string | null
    merged_at?: string | null
    head?: { sha?: string; repo?: { full_name?: string } | null }
    base?: { repo?: { full_name?: string } }
}

/** Commit (e PR, quando houver) que fechou/cita a issue, pela ordem de preferência da timeline. */
export async function resolveIssueCommit(repo: string, number: number): Promise<IssueCommit | null> {
    const timeline = await githubPaginate<unknown>(`/repos/${repo}/issues/${number}/timeline?per_page=100`, { label: "timeline da issue", maxPages: 5 })
    const plan = planIssueCommit(timeline, repo)
    if (!plan) return null
    const { apiUrl } = await getIntegrationConfig("github")
    const web = htmlBaseOf(apiUrl)
    let pull: RawPull | null = null
    if (plan.pr) pull = await githubRequest<RawPull>(`/repos/${plan.pr.repo}/pulls/${plan.pr.number}`, { label: "PR da issue" }).catch(() => null)
    if (plan.commitSha) {
        const sameAsPr = pull && (pull.merge_commit_sha === plan.commitSha || !pull.merge_commit_sha)
        return { commitUrl: `${web}/${plan.commitRepo ?? repo}/commit/${plan.commitSha}`, pullRequestUrl: sameAsPr ? pull!.html_url : null, source: plan.source }
    }
    if (!pull) return null
    const merged = Boolean(pull.merged_at && pull.merge_commit_sha)
    const sha = merged ? pull.merge_commit_sha : pull.head?.sha
    const commitRepo = merged ? (pull.base?.repo?.full_name ?? plan.pr!.repo) : (pull.head?.repo?.full_name ?? plan.pr!.repo)
    return sha ? { commitUrl: `${web}/${commitRepo.toLowerCase()}/commit/${sha}`, pullRequestUrl: pull.html_url, source: plan.source } : null
}

const statusIndex = (status: TaskStatus) => TASK_STATUSES.indexOf(status)

/**
 * Issue fechada: se a tarefa está em Desenvolvimento, vai para Validação com o commit encontrado
 * (tipos sem código vão sem commit). Fechada como "não planejada" não move. Sem commit, tenta de
 * novo por 24 h.
 */
export async function handleClosedIssue(link: IGithubIssueLink, task: TaskDto | null, now = new Date()): Promise<string | null> {
    const dbg = integrationDebug("github")
    const label = `${link.repo}#${link.number}`
    if (link.issueStateReason === "not_planned") {
        await GithubIssueLink.updateOne({ repo: link.repo, number: link.number }, { $set: { pendingCommitUntil: null, notice: "Issue fechada como não planejada" } })
        return `${label}: fechada como não planejada (tarefa não movida)`
    }
    if (!task || task.status !== "development") {
        await GithubIssueLink.updateOne({ repo: link.repo, number: link.number }, { $set: { pendingCommitUntil: null, notice: null } })
        return null
    }
    let commit: IssueCommit | null = null
    if (!isNonCodeTaskType(task.taskType)) {
        try {
            commit = await resolveIssueCommit(link.repo, link.number)
        } catch (error) {
            dbg.warn(`${label}: não foi possível ler a timeline (${error instanceof Error ? error.message : String(error)})`)
        }
        if (!commit) {
            const until = link.pendingCommitUntil ?? new Date(now.getTime() + PENDING_COMMIT_MS)
            const expired = until.getTime() <= now.getTime()
            await GithubIssueLink.updateOne(
                { repo: link.repo, number: link.number },
                { $set: { pendingCommitUntil: expired ? null : until, notice: expired ? "Issue fechada sem commit encontrado: mova a tarefa manualmente" : "Issue fechada: aguardando o commit para ir para Validação" } },
            )
            await publishBoardUpdated([task.id])
            return `${label}: fechada, aguardando commit`
        }
    }
    const { moveTask } = await import("@/features/tasks/server/service")
    try {
        await moveTask(
            task.id,
            { targetStatus: "validation", fromStatus: task.status, code: task.code, ...(commit ? { commitUrl: commit.commitUrl } : {}), ...(commit?.pullRequestUrl ? { pullRequestUrl: commit.pullRequestUrl } : {}) },
            GITHUB_ACTOR,
            { skipIssueSync: true },
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await GithubIssueLink.updateOne({ repo: link.repo, number: link.number }, { $set: { pendingCommitUntil: null, notice: `Não foi possível mover para Validação: ${message}` } })
        await publishBoardUpdated([task.id])
        return `${label}: falha ao mover ${task.code} (${message})`
    }
    await GithubIssueLink.updateOne({ repo: link.repo, number: link.number }, { $set: { pendingCommitUntil: null, notice: null } })
    dbg.info(`${label}: ${task.code} movida para Validação${commit ? ` (${commit.source})` : ""}`)
    return `${label}: ${task.code} → Validação`
}

/** Atualiza o estado guardado da issue; devolve o vínculo se a issue acabou de ser fechada. */
export async function trackIssueState(link: IGithubIssueLink, issue: GithubIssueLite): Promise<IGithubIssueLink | null> {
    if (link.issueState === issue.state && (link.issueStateReason ?? null) === issue.stateReason) return null
    await GithubIssueLink.updateOne({ repo: link.repo, number: link.number }, { $set: { issueState: issue.state, issueStateReason: issue.stateReason, ...(issue.state === "open" ? { notice: null, pendingCommitUntil: null } : {}) } })
    await publishBoardUpdated([link.goTaskId])
    return link.issueState === "open" && issue.state === "closed" ? { ...link, issueState: "closed", issueStateReason: issue.stateReason } : null
}

/** Fecha a issue vinculada (tarefa chegou em Validação ou depois). Issue já fechada é ignorada. */
export async function closeLinkedIssue(link: IGithubIssueLink, taskCode: string | null): Promise<boolean> {
    if (link.issueState === "closed") return false
    await githubRequest(`/repos/${link.repo}/issues/${link.number}`, { method: "PATCH", body: { state: "closed", state_reason: "completed" }, label: "fechar issue" })
    await GithubIssueLink.updateOne({ repo: link.repo, number: link.number }, { $set: { issueState: "closed", issueStateReason: "completed", notice: null, pendingCommitUntil: null } })
    integrationDebug("github").info(`${link.repo}#${link.number} fechada (${taskCode ?? link.goTaskCode ?? link.goTaskId} em Validação)`)
    return true
}

/** Depois de mover uma tarefa: chegou em Validação (ou além) → fecha a issue. Nunca lança. */
export async function onTaskStatusChanged(taskId: string, status: TaskStatus, code: string | null): Promise<void> {
    if (statusIndex(status) < statusIndex("validation")) return
    try {
        const config = await getIntegrationConfig("github")
        if (!config.token) return
        await dbConnect()
        const link = await GithubIssueLink.findOne({ goTaskId: taskId }).lean()
        if (link && (await closeLinkedIssue(link, code))) await publishBoardUpdated([taskId])
    } catch (error) {
        logger.warn({ err: error, taskId }, "[github] Não foi possível fechar a issue vinculada")
        integrationDebug("github").warn(`Não foi possível fechar a issue de ${code ?? taskId}: ${error instanceof Error ? error.message : String(error)}`)
    }
}

/** Tarefas movidas direto no Go! Sipal: as que estão em Validação+ com issue aberta fecham a issue. */
export async function closeIssuesOfValidatedTasks(tasks: readonly TaskDto[]): Promise<number> {
    await dbConnect()
    const open = await GithubIssueLink.find({ issueState: "open" }).lean()
    const byId = new Map(tasks.map((task) => [task.id, task]))
    let closed = 0
    for (const link of open) {
        const task = byId.get(link.goTaskId)
        if (!task || statusIndex(task.status) < statusIndex("validation")) continue
        try {
            if (await closeLinkedIssue(link, task.code)) closed++
        } catch (error) {
            integrationDebug("github").warn(`Não foi possível fechar ${link.repo}#${link.number}: ${error instanceof Error ? error.message : String(error)}`)
        }
    }
    return closed
}
