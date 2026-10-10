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

/** Vínculo de uma tarefa (se houver). */
export async function findIssueLinkByTaskId(taskId: string): Promise<IGithubIssueLink | null> {
    await dbConnect()
    return GithubIssueLink.findOne({ taskId }).lean()
}

export interface NewIssueLink {
    repo: string
    number: number
    url: string
    taskId: string
    taskCode: string
    state: "open" | "closed"
    stateReason: string | null
    /** `updated_at` da issue no momento do vínculo (marca d'água do last-write-wins). */
    issueUpdatedAt?: Date | null
    origin?: "opex" | "github"
}

export async function createIssueLink(input: NewIssueLink): Promise<void> {
    await dbConnect()
    await GithubIssueLink.create({
        ...input,
        issueState: input.state,
        issueStateReason: input.stateReason,
        notice: null,
        issueUpdatedAt: input.issueUpdatedAt ?? null,
        lastOrigin: input.origin ?? "opex",
    })
}

/** Atualiza a marca d'água (e o estado/aviso) do vínculo após um push/pull. */
export interface IssueWatermark {
    issueUpdatedAt: Date | null
    issueState: "open" | "closed"
    issueStateReason: string | null
    notice: string | null
    origin: "opex" | "github"
}

export async function recordIssueWatermark(repo: string, number: number, watermark: IssueWatermark): Promise<void> {
    await dbConnect()
    await GithubIssueLink.updateOne(
        { repo, number },
        {
            $set: {
                issueUpdatedAt: watermark.issueUpdatedAt,
                issueState: watermark.issueState,
                issueStateReason: watermark.issueStateReason,
                notice: watermark.notice,
                lastOrigin: watermark.origin,
            },
        },
    )
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

/** Guarda num aviso a falha de uma sincronização (o card mostra "Abrir issue" com a dica). */
export async function setIssueNotice(repo: string, number: number, notice: string | null): Promise<void> {
    await dbConnect()
    await GithubIssueLink.updateOne({ repo, number }, { $set: { notice } })
}
