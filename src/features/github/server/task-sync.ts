import { dbConnect } from "@/lib/db"
import { logger } from "@/lib/logger"
import { DevTask } from "@/lib/db/models/DevTask"
import type { IGithubIssueLink } from "@/lib/db/models/Github"
import { Project, type IProject } from "@/lib/db/models/Project"
import { publishTasksUpdated, updateTask, moveTask } from "@/features/tasks/server/service"
import { type TaskPriority, type TaskType } from "@/features/tasks/constants"
import { githubRequest } from "../client"
import { columnForIssueState, issueStateForColumn, mapPriority, mapTaskType, reverseLabels, taskDescriptionFromIssue, type GithubIssueLite } from "../logic"
import type { GithubMappingDto } from "../types"
import { errorMessage } from "./errors"
import { findIssueLinkByTaskId, recordIssueWatermark, setIssueNotice } from "./issue-links"
import { getMapping } from "./mappings"

/**
 * Sincronização bidirecional tarefa ↔ issue (last-write-wins). SOMENTE servidor.
 * - `pushTaskToIssue`: a tarefa é a fonte da verdade (edição feita agora) → PATCH na issue.
 * - `applyIssueToTask`: a issue foi atualizada depois → aplica na tarefa (auditoria com origem GitHub).
 * O `issueUpdatedAt` do vínculo é a marca d'água: enquanto a issue não passa dela, nada é puxado.
 */

type ProjectDoc = IProject & { _id: unknown }
type IssueState = "open" | "closed"

interface RawIssue {
    number: number
    html_url: string
    state: IssueState
    state_reason?: string | null
    updated_at: string
}

export interface PushResult {
    pushed: boolean
    error?: string
}

/** Envia a tarefa (título, descrição, tipo/prioridade como labels e aberta/fechada) para a issue. */
export async function pushTaskToIssue(taskId: string): Promise<PushResult> {
    await dbConnect()
    const link = await findIssueLinkByTaskId(taskId)
    if (!link) return { pushed: false }
    const task = await DevTask.findById(taskId).lean()
    if (!task) return { pushed: false }
    const project = await Project.findById(task.projectId).lean()
    if (!project) return { pushed: false }

    const mapping = await getMapping()
    const state = issueStateForColumn(task.columnId, project.closedColumnKey ?? null)
    const labels = reverseLabels((task.taskType as TaskType | null) ?? null, (task.priority as TaskPriority) ?? "medium", mapping)

    try {
        const issue = await githubRequest<RawIssue>(`/repos/${project.repo}/issues/${link.number}`, {
            method: "PATCH",
            body: { title: task.title, body: task.description ?? "", labels, state },
            label: `atualizar issue #${link.number} de ${project.repo}`,
        })
        await recordIssueWatermark(project.repo, link.number, {
            issueUpdatedAt: issue.updated_at ? new Date(issue.updated_at) : null,
            issueState: issue.state ?? state,
            issueStateReason: issue.state_reason ?? null,
            notice: null,
            origin: "opex",
        })
        return { pushed: true }
    } catch (error) {
        const message = errorMessage(error)
        await setIssueNotice(project.repo, link.number, `Falha ao sincronizar com o GitHub: ${message}`)
        logger.warn({ err: error, repo: project.repo, number: link.number }, "[github] Falha ao enviar a tarefa para a issue")
        return { pushed: false, error: message }
    }
}

/** Aplica a issue na tarefa (o GitHub foi atualizado por último). Reusa o serviço de tarefas. */
export async function applyIssueToTask(project: ProjectDoc, issue: GithubIssueLite, link: IGithubIssueLink, mapping: GithubMappingDto): Promise<boolean> {
    await dbConnect()
    const task = await DevTask.findById(link.taskId).lean()
    if (!task) return false

    const type = mapTaskType(issue, mapping.typeRules).value
    const priority = mapPriority(issue, mapping.priorityRules).value
    await updateTask(
        link.taskId,
        { title: issue.title, description: taskDescriptionFromIssue(issue.body), taskType: type, priority },
        "system",
        { origin: "github", publish: false },
    )
    const target = columnForIssueState(issue.state, project.closedColumnKey ?? null, project.entryColumnKey, task.columnId)
    if (target && target !== task.columnId) await moveTask(link.taskId, { targetColumn: target }, "system", { origin: "github", publish: false })

    await publishTasksUpdated([link.taskId])
    return true
}

export type ReconcileStatus = "none" | "applied" | "pushed" | "missing"

/** Decide o lado vencedor da issue vinculada e aplica. */
export async function reconcileTaskIssue(project: ProjectDoc, issue: GithubIssueLite, link: IGithubIssueLink, mapping: GithubMappingDto): Promise<ReconcileStatus> {
    const issueUpdated = issue.updatedAt ? new Date(issue.updatedAt) : null
    const watermark = link.issueUpdatedAt ? new Date(link.issueUpdatedAt) : null
    const changed = Boolean(issueUpdated && (!watermark || issueUpdated.getTime() > watermark.getTime()))
    if (!changed) return "none"

    const task = await DevTask.findById(link.taskId).lean()
    if (!task) return "missing"
    const taskUpdated = task.updatedAt ? new Date(task.updatedAt) : null
    if (issueUpdated && taskUpdated && taskUpdated.getTime() > issueUpdated.getTime()) {
        await pushTaskToIssue(link.taskId)
        return "pushed"
    }
    await applyIssueToTask(project, issue, link, mapping)
    return "applied"
}

/** Empurra várias tarefas para as issues (falha de uma não derruba as outras). */
export async function pushTasksToIssues(taskIds: readonly string[]): Promise<void> {
    for (const taskId of taskIds) {
        try {
            await pushTaskToIssue(taskId)
        } catch (error) {
            logger.warn({ err: error, taskId }, "[github] Falha inesperada ao sincronizar a tarefa")
        }
    }
}
