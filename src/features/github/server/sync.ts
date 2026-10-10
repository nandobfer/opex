import { dbConnect } from "@/lib/db"
import { DevTask } from "@/lib/db/models/DevTask"
import { Project, type IProject } from "@/lib/db/models/Project"
import { TaskBoardColumn } from "@/lib/db/models/TaskBoard"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { createTaskFromIssue } from "@/features/tasks/server/service"
import { githubPaginate, githubRequestFull } from "../client"
import { columnForIssueState, mapPriority, mapTaskType, mentionsIssue, taskDescriptionFromIssue, toIssueLite, type GithubIssueLite } from "../logic"
import type { GithubMappingDto } from "../types"
import { errorMessage } from "./errors"
import { createIssueLink, findIssueLink, updateIssueState } from "./issue-links"
import { getMapping } from "./mappings"
import { reconcileTaskIssue } from "./task-sync"
import { publishGithubUpdated } from "./events"

/**
 * Rotina "Sincronizar issues do GitHub" (Integrações › Crons, padrão a cada 2 min). Para cada
 * repositório vinculado:
 * - 1ª execução: importa as issues ABERTAS;
 * - depois: só o que mudou desde a última leitura (`since` + ETag; 304 não gasta limite);
 * - issue vinculada: sincronização bidirecional com last-write-wins (ver `task-sync.ts`) — se a
 *   issue for mais recente que a tarefa, ela é aplicada na tarefa (coluna ↔ aberta/fechada pela
 *   coluna de conclusão); se a tarefa for mais recente, ela é empurrada para a issue;
 * - issue que uma tarefa do projeto já cita (URL, `owner/repo#N` ou `#N`) só ganha o vínculo;
 * - issue nova vira uma tarefa dO Opex na coluna de entrada (ou na de conclusão, se já fechada),
 *   com tipo/prioridade do mapeamento e a descrição verbatim.
 */

interface LinkSyncResult {
    created: number
    linked: number
    updated: number
}

type ProjectDoc = IProject & { _id: unknown }

/** Processa uma issue de um projeto (exportado para testes). */
export async function processIssue(project: ProjectDoc, issue: GithubIssueLite, mapping: GithubMappingDto, result: LinkSyncResult): Promise<void> {
    if (issue.isPullRequest) return
    const existingLink = await findIssueLink(project.repo, issue.number)
    if (existingLink) {
        // Vinculada: last-write-wins (puxa da issue ou empurra a tarefa).
        const status = await reconcileTaskIssue(project, issue, existingLink, mapping)
        if (status !== "applied" && status !== "pushed" && (await updateIssueState(project.repo, issue.number, issue.state, issue.stateReason))) result.updated++
        return
    }

    const tasks = await DevTask.find({ projectId: String(project._id) })
        .select({ code: 1, title: 1, description: 1, technicalSpec: 1 })
        .lean()
    const cited = tasks.find((task) => mentionsIssue([task.title, task.description, task.technicalSpec].filter(Boolean).join("\n"), project.repo, issue.number))
    if (cited) {
        await createIssueLink({
            repo: project.repo,
            number: issue.number,
            url: issue.htmlUrl,
            taskId: String(cited._id),
            taskCode: cited.code,
            state: issue.state,
            stateReason: issue.stateReason,
            issueUpdatedAt: issue.updatedAt ? new Date(issue.updatedAt) : null,
            origin: "github",
        })
        result.linked++
        return
    }

    const type = mapTaskType(issue, mapping.typeRules)
    const priority = mapPriority(issue, mapping.priorityRules)
    const columnId = columnForIssueState(issue.state, project.closedColumnKey ?? null, project.entryColumnKey, project.entryColumnKey) ?? project.entryColumnKey
    const task = await createTaskFromIssue({
        title: issue.title,
        description: taskDescriptionFromIssue(issue.body),
        projectId: String(project._id),
        columnId,
        taskType: type.value,
        priority: priority.value,
    })
    await createIssueLink({
        repo: project.repo,
        number: issue.number,
        url: issue.htmlUrl,
        taskId: task.id,
        taskCode: task.code,
        state: issue.state,
        stateReason: issue.stateReason,
        issueUpdatedAt: issue.updatedAt ? new Date(issue.updatedAt) : null,
        origin: "github",
    })
    result.created++
}

async function fetchIssues(project: ProjectDoc): Promise<{ issues: GithubIssueLite[]; since: Date | null; etag: string | null; initial: boolean; notModified: boolean }> {
    if (!project.initialImportAt) {
        const startedAt = new Date()
        const raw = await githubPaginate<unknown>(`/repos/${project.repo}/issues?state=open&per_page=100`, { label: `issues abertas de ${project.repo}`, maxPages: 10 })
        return { issues: raw.map(toIssueLite).filter((issue): issue is GithubIssueLite => issue !== null), since: startedAt, etag: null, initial: true, notModified: false }
    }
    const since = project.since ?? project.initialImportAt
    const path = `/repos/${project.repo}/issues?state=all&sort=updated&direction=asc&per_page=100&since=${encodeURIComponent(new Date(since).toISOString())}`
    const first = await githubRequestFull<unknown[]>(path, { etag: project.etag, label: `issues alteradas de ${project.repo}` })
    if (first.notModified) return { issues: [], since: new Date(since), etag: project.etag, initial: false, notModified: true }
    const raw = [...(first.data ?? [])]
    if (first.next) raw.push(...(await githubPaginate<unknown>(first.next, { label: `issues alteradas de ${project.repo}`, maxPages: 9 })))
    const issues = raw.map(toIssueLite).filter((issue): issue is GithubIssueLite => issue !== null)
    const latest = issues.reduce<Date>((max, issue) => (issue.updatedAt && new Date(issue.updatedAt) > max ? new Date(issue.updatedAt) : max), new Date(since))
    return { issues, since: latest, etag: first.etag, initial: false, notModified: false }
}

export async function syncGithubIssues(): Promise<string> {
    const config = await getIntegrationConfig("github")
    if (!config.token) return "Pulada: GitHub sem token"

    await dbConnect()
    const projects = await Project.find({ enabled: true }).lean()
    if (projects.length === 0) return "Nenhum vínculo ativo"

    const dbg = integrationDebug("github")
    const mapping = await getMapping()
    const columns = new Set((await TaskBoardColumn.find().select({ key: 1 }).lean()).map((column) => column.key))
    const summary: string[] = []

    for (const project of projects) {
        const result: LinkSyncResult = { created: 0, linked: 0, updated: 0 }
        try {
            if (!columns.has(project.entryColumnKey)) throw new Error("a coluna de entrada não existe mais (edite o vínculo)")
            const fetched = await fetchIssues(project)
            for (const issue of fetched.issues) await processIssue(project, issue, mapping, result)
            const parts = [
                fetched.notModified ? "sem mudanças" : `${fetched.issues.filter((issue) => !issue.isPullRequest).length} issue(s) lida(s)`,
                result.created ? `${result.created} tarefa(s) nova(s)` : null,
                result.linked ? `${result.linked} vinculada(s) a tarefas existentes` : null,
                result.updated ? `${result.updated} issue(s) atualizada(s)` : null,
            ].filter(Boolean)
            const message = `${fetched.initial ? "Importação inicial: " : ""}${parts.join("; ")}`
            await Project.updateOne(
                { _id: project._id },
                { $set: { since: fetched.since, etag: fetched.etag, ...(fetched.initial ? { initialImportAt: new Date() } : {}), lastSync: { at: new Date(), ok: true, message } } },
            )
            summary.push(`${project.repo}: ${message}`)
        } catch (error) {
            const message = errorMessage(error)
            await Project.updateOne({ _id: project._id }, { $set: { lastSync: { at: new Date(), ok: false, message } } })
            dbg.warn(`${project.repo}: ${message}`)
            summary.push(`${project.repo}: falhou (${message})`)
        }
    }

    await publishGithubUpdated("sync")
    return summary.join(" | ")
}
