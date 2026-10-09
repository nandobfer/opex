import { dbConnect } from "@/lib/db"
import { GithubIssueLink, GithubRepoLink, TaskDraft, type IGithubIssueLink, type IGithubRepoLink, type ITaskDraft } from "@/lib/db/models/Github"
import { TaskBoardColumn } from "@/lib/db/models/TaskBoard"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { fetchAllTasks } from "@/features/tasks/server/service"
import { draftTaskId } from "@/features/tasks/drafts"
import type { TaskDto } from "@/features/tasks/types"
import { githubPaginate, githubRequestFull } from "../client"
import { mentionsIssue, toIssueLite, type GithubIssueLite } from "../logic"
import { errorMessage } from "./errors"
import { buildMappingContext, createDraftFromIssue, refreshDraftFromIssue, type MappingContext } from "./drafts"
import { publishBoardUpdated, publishGithubUpdated } from "./events"
import { closeIssuesOfValidatedTasks, handleClosedIssue, trackIssueState } from "./issue-links"
import { listGoProductTasks, type GoTaskText } from "./go-sipal"
import { upsertSeenPeople, type SeenPerson } from "./people"

/**
 * Rotina "Sincronizar issues do GitHub" (Integrações › Crons, padrão a cada 2 min). Para cada
 * vínculo ativo:
 * - 1ª execução: importa as issues ABERTAS dos autores configurados;
 * - depois: só o que mudou desde a última leitura (`since` + ETag; 304 não gasta limite);
 * - issue que uma tarefa do produto já cita (URL, `owner/repo#N` ou `#N`) só ganha o vínculo;
 * - issue nova vira rascunho; editada atualiza o rascunho; fechada marca o rascunho ou move a
 *   tarefa vinculada para Validação.
 * Fecha também as issues das tarefas que chegaram em Validação direto no Go! Sipal.
 */

interface LinkSyncResult {
    created: number
    linked: number
    updated: number
    moved: string[]
}

type DraftDoc = ITaskDraft & { _id: unknown }

/** Processa uma issue de um vínculo (puro de rede além do Go! Sipal/banco). Exportado para testes. */
export async function processIssue(
    link: IGithubRepoLink,
    issue: GithubIssueLite,
    deps: { ctx: MappingContext; productTasks: () => Promise<GoTaskText[]>; tasksById: Map<string, TaskDto>; initial: boolean },
    result: LinkSyncResult,
    boardIds: Set<string>,
): Promise<void> {
    if (issue.isPullRequest) return
    const issueLink = await GithubIssueLink.findOne({ repo: link.repo, number: issue.number }).lean()
    if (issueLink) {
        const closed = await trackIssueState(issueLink, issue)
        if (closed) {
            const message = await handleClosedIssue(closed, deps.tasksById.get(closed.goTaskId) ?? null)
            if (message) result.moved.push(message)
        }
        const draft = await TaskDraft.findOne({ repo: link.repo, number: issue.number }).lean()
        if (draft) await refreshDraftFromIssue(draft as DraftDoc, issue, deps.ctx)
        return
    }

    const draft = (await TaskDraft.findOne({ repo: link.repo, number: issue.number }).lean()) as DraftDoc | null
    if (draft) {
        if (await refreshDraftFromIssue(draft, issue, deps.ctx)) {
            result.updated++
            if (draft.state === "draft" || draft.state === "sending") boardIds.add(draftTaskId(String(draft._id)))
        }
        return
    }

    // Issue nova: só de autores configurados e ainda aberta.
    if (!link.authors.includes(issue.author.login) || issue.state !== "open") return
    const existing = (await deps.productTasks()).find((item) => item.text.includes(issue.htmlUrl) || mentionsIssue(item.text, link.repo, issue.number))
    if (existing) {
        await GithubIssueLink.create({
            repo: link.repo,
            number: issue.number,
            url: issue.htmlUrl,
            goTaskId: existing.task.id,
            goTaskCode: existing.task.code,
            source: "detected",
            issueState: issue.state,
            issueStateReason: issue.stateReason,
            pendingCommitUntil: null,
            notice: null,
        })
        result.linked++
        boardIds.add(existing.task.id)
        return
    }
    const id = await createDraftFromIssue(link, issue, deps.ctx)
    result.created++
    boardIds.add(draftTaskId(id))
}

async function fetchIssues(link: IGithubRepoLink & { _id: unknown }): Promise<{ issues: GithubIssueLite[]; since: Date | null; etag: string | null; initial: boolean; notModified: boolean }> {
    if (!link.initialImportAt) {
        const startedAt = new Date()
        const raw = await githubPaginate<unknown>(`/repos/${link.repo}/issues?state=open&per_page=100`, { label: `issues abertas de ${link.repo}`, maxPages: 10 })
        return { issues: raw.map(toIssueLite).filter((issue): issue is GithubIssueLite => issue !== null), since: startedAt, etag: null, initial: true, notModified: false }
    }
    const since = link.since ?? link.initialImportAt
    const path = `/repos/${link.repo}/issues?state=all&sort=updated&direction=asc&per_page=100&since=${encodeURIComponent(new Date(since).toISOString())}`
    const first = await githubRequestFull<unknown[]>(path, { etag: link.etag, label: `issues alteradas de ${link.repo}` })
    if (first.notModified) return { issues: [], since: new Date(since), etag: link.etag, initial: false, notModified: true }
    const raw = [...(first.data ?? [])]
    if (first.next) raw.push(...(await githubPaginate<unknown>(first.next, { label: `issues alteradas de ${link.repo}`, maxPages: 9 })))
    const issues = raw.map(toIssueLite).filter((issue): issue is GithubIssueLite => issue !== null)
    const latest = issues.reduce<Date>((max, issue) => (issue.updatedAt && new Date(issue.updatedAt) > max ? new Date(issue.updatedAt) : max), new Date(since))
    return { issues, since: latest, etag: first.etag, initial: false, notModified: false }
}

/** Issues fechadas sem commit encontrado: tenta de novo até o prazo. */
async function retryPendingCommits(tasksById: Map<string, TaskDto>): Promise<string[]> {
    const pending = await GithubIssueLink.find({ pendingCommitUntil: { $ne: null } }).lean()
    const messages: string[] = []
    for (const link of pending as IGithubIssueLink[]) {
        const message = await handleClosedIssue(link, tasksById.get(link.goTaskId) ?? null)
        if (message) messages.push(message)
    }
    return messages
}

export async function syncGithubIssues(): Promise<string> {
    const config = await getIntegrationConfig("github")
    if (!config.token) return "Pulada: GitHub sem token"
    const goConfig = await getIntegrationConfig("go_sipal")
    if (!goConfig.token) return "Pulada: Go! Sipal sem sessão"

    await dbConnect()
    const links = await GithubRepoLink.find({ enabled: true }).lean()
    if (links.length === 0) return "Nenhum vínculo ativo"

    const dbg = integrationDebug("github")
    const tasks = await fetchAllTasks({ includeArchived: true })
    const tasksById = new Map(tasks.map((task) => [task.id, task]))
    const ctx = await buildMappingContext()
    const columns = new Set((await TaskBoardColumn.find().select({ key: 1 }).lean()).map((column) => column.key))
    const boardIds = new Set<string>()
    const summary: string[] = []

    for (const link of links) {
        const result: LinkSyncResult = { created: 0, linked: 0, updated: 0, moved: [] }
        try {
            if (!columns.has(link.entryColumnKey)) throw new Error("a coluna de entrada não existe mais (edite o vínculo)")
            const fetched = await fetchIssues(link)
            let productTasks: Promise<GoTaskText[]> | null = null
            const deps = { ctx, tasksById, initial: fetched.initial, productTasks: () => (productTasks ??= listGoProductTasks(link.productId)) }
            const seen: SeenPerson[] = []
            for (const issue of fetched.issues) {
                if (issue.isPullRequest) continue
                seen.push({ login: issue.author.login, avatarUrl: issue.author.avatarUrl, repo: link.repo }, ...issue.assignees.map((login) => ({ login, repo: link.repo })))
                await processIssue(link, issue, deps, result, boardIds)
            }
            if ((await upsertSeenPeople(seen)) > 0) await publishGithubUpdated("people")
            const parts = [
                fetched.notModified ? "sem mudanças" : `${fetched.issues.filter((issue) => !issue.isPullRequest).length} issue(s) lida(s)`,
                result.created ? `${result.created} rascunho(s) novo(s)` : null,
                result.linked ? `${result.linked} vinculada(s) a tarefas existentes` : null,
                result.updated ? `${result.updated} rascunho(s) atualizado(s)` : null,
                ...result.moved,
            ].filter(Boolean)
            const message = `${fetched.initial ? "Importação inicial: " : ""}${parts.join("; ")}`
            await GithubRepoLink.updateOne(
                { _id: link._id },
                { $set: { since: fetched.since, etag: fetched.etag, ...(fetched.initial ? { initialImportAt: new Date() } : {}), lastSync: { at: new Date(), ok: true, message } } },
            )
            summary.push(`${link.repo}: ${message}`)
        } catch (error) {
            const message = errorMessage(error)
            await GithubRepoLink.updateOne({ _id: link._id }, { $set: { lastSync: { at: new Date(), ok: false, message } } })
            dbg.warn(`${link.repo}: ${message}`)
            summary.push(`${link.repo}: falhou (${message})`)
        }
    }

    summary.push(...(await retryPendingCommits(tasksById)))
    const closed = await closeIssuesOfValidatedTasks(tasks)
    if (closed) summary.push(`${closed} issue(s) fechada(s) por tarefas em Validação`)

    await publishBoardUpdated([...boardIds])
    await publishGithubUpdated("sync")
    return summary.join(" | ")
}
