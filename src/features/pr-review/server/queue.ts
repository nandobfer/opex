import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { getLocalUser } from "@/lib/local-user"
import { publishAppEvent } from "@/lib/pusher/channels"
import { PrReview } from "@/lib/db/models/PrReview"
import { githubPaginate } from "@/features/github/client"
import { loggerFor } from "@/lib/logger"
import { availabilityOfPrReview, loadPrReviewSettings } from "@/features/ai/server/settings"
import { matchesReviewScope } from "../logic"
import { PR_REVIEW_AUDIT_ENTITY, PR_REVIEW_UPDATED_EVENT } from "../constants"
import { githubLogin, listReviewTargets, workbenchPrIndex, type ReviewTarget } from "./targets"

/**
 * Fila da revisão de PR: a rotina `agentic-pr-watch` lista os PRs abertos dos repositórios das
 * centrais, aplica o critério da aba e enfileira uma revisão por PR e commit (head SHA). Revisão
 * ainda na fila de um commit antigo passa para o commit novo (pushes em sequência não acumulam).
 */

const log = loggerFor({ module: "pr-review" })

export interface GithubPullItem {
    number: number
    html_url: string
    title: string
    draft?: boolean | null
    user: { login: string } | null
    requested_reviewers?: { login: string }[] | null
    base?: { ref: string } | null
    head?: { sha: string } | null
}

export interface ReviewCandidate {
    target: ReviewTarget
    pull: GithubPullItem
    workbenchId: string | null
}

export type EnqueueResult = "created" | "moved" | "exists"

async function publishQueued(id: string, repo: string, number: number, headSha: string, trigger: "auto" | "manual"): Promise<void> {
    // A solicitação manual registra/publica no serviço, inclusive quando refaz o mesmo commit.
    if (trigger !== "auto") return
    await recordAudit({ userId: getLocalUser().id, entidade: PR_REVIEW_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { pr: `${repo}#${number}`, commit: headSha.slice(0, 7), estado: "queued", origem: trigger } })
    await publishAppEvent(PR_REVIEW_UPDATED_EVENT, { id }).catch((error) => log.warn({ err: error, reviewId: id }, "[pr-review] Falha ao publicar atualização da fila"))
}

/** Enfileira a revisão do commit atual do PR (idempotente por `repo + número + SHA`). */
export async function enqueueReview({ target, pull, workbenchId }: ReviewCandidate, trigger: "auto" | "manual"): Promise<{ result: EnqueueResult; id: string }> {
    await dbConnect()
    const headSha = pull.head?.sha
    if (!headSha) throw new Error(`PR #${pull.number} sem head SHA`)
    const key = { repo: target.repo, number: pull.number }
    const fields = {
        url: pull.html_url,
        title: pull.title,
        author: pull.user?.login ?? null,
        baseRef: pull.base?.ref ?? "",
        draft: Boolean(pull.draft),
        centralId: target.centralId,
        projectName: target.projectName,
        workbenchId,
    }
    const existing = await PrReview.findOne({ ...key, headSha }).select({ _id: 1 }).lean()
    if (existing) return { result: "exists", id: String(existing._id) }
    const queued = await PrReview.findOneAndUpdate({ ...key, state: "queued" }, { $set: { ...fields, headSha, trigger } }, { new: true }).lean()
    if (queued) {
        await publishQueued(String(queued._id), target.repo, pull.number, headSha, trigger)
        return { result: "moved", id: String(queued._id) }
    }
    try {
        const created = await PrReview.create({ ...key, ...fields, headSha, trigger, state: "queued" })
        await publishQueued(String(created._id), target.repo, pull.number, headSha, trigger)
        return { result: "created", id: String(created._id) }
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error
        const again = await PrReview.findOne({ ...key, headSha }).select({ _id: 1 }).lean()
        return { result: "exists", id: String(again?._id ?? "") }
    }
}

/**
 * Varredura da rotina: enfileira os PRs que atendem ao critério. Não inicia nada (quem inicia é
 * `pumpPrReviews`). Falha num repositório não interrompe os demais.
 */
export async function scanPullRequestsForReview(): Promise<string> {
    const { settings } = await loadPrReviewSettings()
    if (!settings.enabled) return "Revisão de PR desativada"
    const availability = await availabilityOfPrReview(settings)
    if (!availability.available) return `Revisão de PR indisponível: ${availability.reason ?? "verifique a configuração"}`
    const [targets, myLogin, workbenches] = await Promise.all([listReviewTargets(), githubLogin(), workbenchPrIndex()])
    let queued = 0
    let failures = 0
    for (const target of targets) {
        try {
            const pulls = await githubPaginate<GithubPullItem>(`/repos/${target.repo}/pulls?state=open&per_page=100`, { maxPages: 3 })
            for (const pull of pulls) {
                const workbenchId = workbenches.get(`${target.repo}#${pull.number}`) ?? null
                const candidate = { author: pull.user?.login ?? null, draft: Boolean(pull.draft), requestedReviewers: (pull.requested_reviewers ?? []).map((user) => user.login), workbench: Boolean(workbenchId) }
                if (!matchesReviewScope(candidate, settings, myLogin)) continue
                const { result } = await enqueueReview({ target, pull, workbenchId }, "auto")
                if (result !== "exists") queued++
            }
        } catch (error) {
            failures++
            log.warn({ err: error, repo: target.repo }, "[pr-review] Falha ao listar os PRs do repositório")
        }
    }
    return `Revisão de PR: ${targets.length} repositório(s); ${queued} revisão(ões) na fila${failures ? `; ${failures} com falha` : ""}`
}
