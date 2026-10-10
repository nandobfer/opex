import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { runAfterResponse } from "@/lib/after-response"
import { Project } from "@/lib/db/models/Project"
import { assertColumn, createTask, type CreateTaskOptions } from "@/features/tasks/server/service"
import type { CreateTaskInput } from "@/features/tasks/schemas"
import type { TaskDto } from "@/features/tasks/types"
import { githubRequest } from "../client"
import { reverseLabels } from "../logic"
import { toGithubDomainError } from "./errors"
import { createIssueLink } from "./issue-links"
import { getMapping } from "./mappings"

/**
 * Criação de tarefa com issue no GitHub (SOMENTE servidor). O GitHub é chamado ANTES de persistir:
 * se a issue não for criada, **nenhuma tarefa é criada** (erro bloqueante). O vínculo já nasce com a
 * marca d'água (`issueUpdatedAt`) da sincronização bidirecional.
 */

type IssueState = "open" | "closed"

interface RawIssue {
    number: number
    html_url: string
    state: IssueState
    state_reason?: string | null
    updated_at: string
}

async function createGithubIssue(repo: string, body: { title: string; body: string; labels: string[] }): Promise<RawIssue> {
    try {
        return await githubRequest<RawIssue>(`/repos/${repo}/issues`, { method: "POST", body, label: `criar issue em ${repo}` })
    } catch (error) {
        toGithubDomainError(error)
    }
}

/** Cria a tarefa e a issue vinculada. Falha do GitHub bloqueia a criação (`DomainError`). */
export async function createTaskWithIssue(input: CreateTaskInput, actorId: string, options: Omit<CreateTaskOptions, "actorId"> = {}): Promise<TaskDto> {
    await dbConnect()
    const project = await Project.findById(input.projectId).lean()
    if (!project) throw new DomainError(400, "Projeto inválido", "PROJECT_NOT_FOUND")
    await assertColumn(input.columnId)

    const mapping = await getMapping()
    const labels = reverseLabels(input.taskType ?? null, input.priority ?? null, mapping)
    const issue = await createGithubIssue(project.repo, { title: input.title, body: input.description?.trim() || "", labels })

    const task = await createTask(input, { actorId, ...options })
    await createIssueLink({
        repo: project.repo,
        number: issue.number,
        url: issue.html_url,
        taskId: task.id,
        taskCode: task.code,
        state: issue.state,
        stateReason: issue.state_reason ?? null,
        issueUpdatedAt: issue.updated_at ? new Date(issue.updated_at) : null,
        origin: "opex",
    })
    runAfterResponse("task-summary", async () => {
        const { generateTaskSummary } = await import("@/features/ai/server/task-summary")
        await generateTaskSummary(task.id)
    })
    // Tarefas do portal já chegam com as tags do rascunho (não gera de novo).
    if (!options.tags) {
        runAfterResponse("task-tags", async () => {
            const { generateTaskTags } = await import("@/features/ai/server/task-tags")
            await generateTaskTags(task.id)
        })
    }
    return { ...task, issue: { url: issue.html_url, repo: project.repo, number: issue.number, state: issue.state, notice: null } }
}
