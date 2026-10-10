import { dbConnect } from "@/lib/db"
import { GithubIssueLink, type IGithubIssueLink } from "@/lib/db/models/Github"
import { logger } from "@/lib/logger"
import type { TaskIssueRef } from "@/features/tasks/types"

/**
 * Vínculo issue ↔ tarefa dO Opex: botão "Abrir issue" e dedupe da sincronização. A coluna da tarefa
 * é sempre gerida por você (sem transições automáticas). Somente servidor.
 */

const toRef = (link: IGithubIssueLink): TaskIssueRef => ({ url: link.url, repo: link.repo, number: link.number, state: link.issueState, notice: link.notice ?? null })

/** Issues vinculadas às tarefas informadas (id da tarefa → issue). */
export async function issueRefsFor(taskIds: readonly string[]): Promise<Map<string, TaskIssueRef>> {
    if (taskIds.length === 0) return new Map()
    try {
        await dbConnect()
        const links = await GithubIssueLink.find({ taskId: { $in: [...taskIds] } }).lean()
        return new Map(links.map((link) => [link.taskId, toRef(link)]))
    } catch (error) {
        logger.warn({ err: error }, "[github] Vínculos de issues indisponíveis")
        return new Map()
    }
}

export async function findIssueLink(repo: string, number: number): Promise<IGithubIssueLink | null> {
    await dbConnect()
    return GithubIssueLink.findOne({ repo, number }).lean()
}

export interface NewIssueLink {
    repo: string
    number: number
    url: string
    taskId: string
    taskCode: string
    state: "open" | "closed"
    stateReason: string | null
}

export async function createIssueLink(input: NewIssueLink): Promise<void> {
    await dbConnect()
    await GithubIssueLink.create({ ...input, issueState: input.state, issueStateReason: input.stateReason, notice: null })
}

/** Atualiza o estado da issue (aberta/fechada). Devolve `true` se mudou. */
export async function updateIssueState(repo: string, number: number, state: "open" | "closed", stateReason: string | null): Promise<boolean> {
    await dbConnect()
    const link = await GithubIssueLink.findOne({ repo, number }).lean()
    if (!link) return false
    if (link.issueState === state && (link.issueStateReason ?? null) === stateReason) return false
    await GithubIssueLink.updateOne(
        { repo, number },
        { $set: { issueState: state, issueStateReason: stateReason, notice: state === "closed" ? "Issue fechada" : null } },
    )
    return true
}
