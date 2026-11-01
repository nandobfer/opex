import { isValidObjectId } from "mongoose"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { removeOpencodeSessionSafe } from "@/lib/ai/opencode-sessions"
import { loggerFor } from "@/lib/logger"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { getLocalUser } from "@/lib/local-user"
import { publishAppEvent } from "@/lib/pusher/channels"
import { pageInfo } from "@/lib/list/query"
import { ADVERSARIAL_AUDIT_ENTITY, ADVERSARIAL_DECISION_LABELS, ADVERSARIAL_HISTORY_LIMIT, ADVERSARIAL_PAGE_LIMIT, ADVERSARIAL_UPDATED_EVENT, type AdversarialDecision } from "../constants"
import { buildFixPrompt } from "../prompt"
import { findingsToFix } from "../rounds"
import type { AdversarialFixInput, AdversarialReviewListQuery } from "../schemas"
import type { AdversarialReviewDetailDto, AdversarialReviewDto, AdversarialReviewListDto } from "../types"
import { countBySeverity } from "../verdict"
import { listCentralOptions } from "./central-options"
import { buildAdversarialReviewListFilter } from "./list-query"
import { AdversarialReview, adversarialDb, type IAdversarialReview } from "./models"

/** Revisões do adversário: consultas (aba Revisões, mesa) e as decisões do usuário na mesa. */

const log = loggerFor({ module: "adversarial-agent" })

const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null)

export function toReviewDto(doc: IAdversarialReview): AdversarialReviewDto {
    const startedAt = doc.startedAt ? new Date(doc.startedAt).getTime() : null
    const finishedAt = doc.finishedAt ? new Date(doc.finishedAt).getTime() : null
    return {
        id: String(doc._id),
        workbenchId: doc.workbenchId,
        centralId: doc.centralId,
        taskId: doc.taskId,
        taskCode: doc.taskCode,
        taskTitle: doc.taskTitle,
        cycle: doc.cycle,
        round: doc.round,
        level: doc.level,
        state: doc.state,
        decision: doc.decision ?? null,
        limitReached: doc.limitReached === true,
        summary: doc.summary ?? null,
        blocking: (doc.findings ?? []).filter((finding) => finding.blocking).length,
        counts: countBySeverity(doc.findings ?? []),
        error: doc.error ?? null,
        costUsd: doc.usage?.costUsd ?? 0,
        durationMs: startedAt && finishedAt ? finishedAt - startedAt : null,
        createdAt: iso(doc.createdAt) ?? new Date().toISOString(),
        finishedAt: iso(doc.finishedAt),
    }
}

export function toReviewDetailDto(doc: IAdversarialReview): AdversarialReviewDetailDto {
    return {
        ...toReviewDto(doc),
        findings: doc.findings ?? [],
        previous: doc.previous ?? [],
        disputes: doc.disputes ?? [],
        excluded: doc.excluded ?? [],
        userText: doc.userText ?? null,
        report: doc.report ?? null,
    }
}

export async function publishReviews(workbenchId: string): Promise<void> {
    await publishAppEvent(ADVERSARIAL_UPDATED_EVENT, { workbenchId }).catch(() => undefined)
}

/** Rodadas no recorte dos filtros, mais recentes primeiro, com as centrais (opções do filtro). */
export async function listAdversarialReviews(query: Partial<AdversarialReviewListQuery> = {}): Promise<AdversarialReviewListDto> {
    await adversarialDb()
    const page = query.page ?? 1
    const limit = query.limit ?? ADVERSARIAL_PAGE_LIMIT
    const filter = buildAdversarialReviewListFilter({ q: query.q ?? "", states: query.states ?? [], decisions: query.decisions ?? [], levels: query.levels ?? [], centrals: query.centrals ?? [], from: query.from, to: query.to })
    const [docs, total, centrals] = await Promise.all([
        AdversarialReview.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean() as unknown as Promise<IAdversarialReview[]>,
        AdversarialReview.countDocuments(filter),
        listCentralOptions(),
    ])
    return { items: docs.map(toReviewDto), ...pageInfo(page, limit, total), centrals }
}

export async function getAdversarialReview(id: string): Promise<AdversarialReviewDetailDto> {
    if (!isValidObjectId(id)) throw new DomainError(404, "Revisão não encontrada", "ADVERSARIAL_REVIEW_NOT_FOUND")
    await adversarialDb()
    const doc = (await AdversarialReview.findById(id).lean()) as IAdversarialReview | null
    if (!doc) throw new DomainError(404, "Revisão não encontrada", "ADVERSARIAL_REVIEW_NOT_FOUND")
    return toReviewDetailDto(doc)
}

/** Rodadas da mesa, da mais nova para a mais antiga. */
export async function workbenchReviews(workbenchId: string, limit = 20): Promise<IAdversarialReview[]> {
    await adversarialDb()
    return (await AdversarialReview.find({ workbenchId }).sort({ createdAt: -1 }).limit(limit).lean()) as unknown as IAdversarialReview[]
}

export async function latestWorkbenchReview(workbenchId: string): Promise<AdversarialReviewDetailDto | null> {
    const [latest] = await workbenchReviews(workbenchId, 1)
    return latest ? toReviewDetailDto(latest) : null
}

/** Rodadas da mesa com os detalhes, da mais antiga para a mais nova (aba "Adversário" da mesa). */
export async function listWorkbenchReviews(workbenchId: string): Promise<AdversarialReviewDetailDto[]> {
    const docs = await workbenchReviews(workbenchId, ADVERSARIAL_HISTORY_LIMIT)
    return docs.reverse().map(toReviewDetailDto)
}

async function decide(doc: IAdversarialReview, decision: AdversarialDecision, extra: Record<string, unknown> = {}): Promise<void> {
    await AdversarialReview.updateOne({ _id: doc._id }, { $set: { decision, ...extra } })
    await recordAudit({
        userId: getLocalUser().id,
        entidade: ADVERSARIAL_AUDIT_ENTITY,
        entidadeId: String(doc._id),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { tarefa: doc.taskCode, rodada: doc.round, decisao: doc.decision ? ADVERSARIAL_DECISION_LABELS[doc.decision] : null },
        depois: { tarefa: doc.taskCode, rodada: doc.round, decisao: ADVERSARIAL_DECISION_LABELS[decision], ...extra },
    })
    await publishReviews(doc.workbenchId)
}

async function latestOrFail(workbenchId: string): Promise<IAdversarialReview> {
    const [latest] = await workbenchReviews(workbenchId, 1)
    if (!latest) throw new DomainError(409, "A mesa não tem revisão do agente adversário", "ADVERSARIAL_REVIEW_NOT_FOUND")
    return latest
}

/**
 * "Corrigir": registra a decisão e devolve o pedido de correção ao implementador com os achados
 * bloqueantes que ficaram marcados (e a orientação opcional do usuário).
 */
export async function prepareUserFix(workbenchId: string, worktreePath: string, input: AdversarialFixInput): Promise<string> {
    const latest = await latestOrFail(workbenchId)
    if (latest.decision !== "awaiting") throw new DomainError(409, "A última revisão não está aguardando decisão", "ADVERSARIAL_NOT_AWAITING")
    const findings = findingsToFix(latest.findings ?? [], input.excluded)
    if (!findings.length) throw new DomainError(400, "Mantenha ao menos um achado marcado ou use Seguir mesmo assim", "ADVERSARIAL_NOTHING_TO_FIX")
    const userText = input.text?.trim() || null
    await decide(latest, "fix-user", { excluded: input.excluded ?? [], userText })
    return buildFixPrompt({ round: latest.round, worktreePath, findings, userText })
}

/** "Seguir mesmo assim": a mesa segue para a prévia ou o PR ignorando os bloqueios (ou a falha). */
export async function recordSkip(workbenchId: string): Promise<void> {
    const [latest] = await workbenchReviews(workbenchId, 1)
    if (latest) await decide(latest, "skipped")
}

/** A ação não pôde começar (ex.: OpenCode indisponível): a última revisão volta a aguardar a decisão. */
export async function restoreAwaiting(workbenchId: string): Promise<void> {
    const [latest] = await workbenchReviews(workbenchId, 1)
    if (latest && (latest.decision === "fix-user" || latest.decision === "rerun")) {
        await AdversarialReview.updateOne({ _id: latest._id }, { $set: { decision: "awaiting", excluded: [], userText: null } })
        await publishReviews(workbenchId)
    }
}

/** "Revisar de novo": a próxima rodada revisa o código atual (mesmo ciclo). */
export async function recordRerun(workbenchId: string): Promise<void> {
    const latest = await latestOrFail(workbenchId)
    if (latest.decision !== "awaiting") throw new DomainError(409, "A última revisão não está aguardando decisão", "ADVERSARIAL_NOT_AWAITING")
    await decide(latest, "rerun")
}

/** Exclui a sessão do OpenCode de uma rodada (não encontrada = já excluída). */
export function removeReviewSession(client: OpencodeClient, sessionId: string): Promise<boolean> {
    return removeOpencodeSessionSafe(client, sessionId, log, "adversarial")
}

/**
 * Rodada "revisando" sem turno vivo (o app reiniciou durante a revisão): vira falha e a sessão dela
 * fica pendente de exclusão (tentada de novo na próxima rodada ou na exclusão da mesa). Assim o
 * "Tentar novamente" repete a mesma rodada em vez de abrir um ciclo novo.
 */
export async function failOrphanReviews(workbenchId: string, message: string): Promise<void> {
    await adversarialDb()
    const orphans = (await AdversarialReview.find({ workbenchId, state: "running" }).lean()) as unknown as IAdversarialReview[]
    if (!orphans.length) return
    for (const doc of orphans) {
        const pending = doc.sessionId ?? doc.pendingSessionDeletion ?? null
        await AdversarialReview.updateOne({ _id: doc._id, state: "running" }, { $set: { state: "failed", decision: "failed", error: message, finishedAt: new Date(), sessionId: null, pendingSessionDeletion: pending } })
        await recordAudit({
            userId: getLocalUser().id,
            entidade: ADVERSARIAL_AUDIT_ENTITY,
            entidadeId: String(doc._id),
            acao: AcaoAuditoria.ATUALIZAR,
            antes: { tarefa: doc.taskCode, rodada: doc.round, estado: "running" },
            depois: { tarefa: doc.taskCode, rodada: doc.round, estado: "failed", decisao: ADVERSARIAL_DECISION_LABELS.failed },
        })
        log.warn({ workbenchId, reviewId: String(doc._id) }, "[adversarial] rodada órfã marcada como falha (o app reiniciou)")
    }
    await publishReviews(workbenchId)
}

/**
 * Exclusão da mesa: exclui as sessões do OpenCode que rodadas desta mesa ainda seguram (em curso ou
 * pendentes). Melhor esforço; as revisões ficam no histórico.
 */
export async function removeWorkbenchReviewSessions(workbenchId: string): Promise<void> {
    await adversarialDb()
    const docs = (await AdversarialReview.find({ workbenchId, $or: [{ sessionId: { $ne: null } }, { pendingSessionDeletion: { $ne: null } }] }).lean()) as unknown as IAdversarialReview[]
    if (!docs.length) return
    const client = await getOpencodeClient()
    for (const doc of docs) {
        const sessions = [...new Set([doc.sessionId, doc.pendingSessionDeletion].filter((value): value is string => Boolean(value)))]
        let removed = true
        for (const sessionId of sessions) removed = (await removeReviewSession(client, sessionId)) && removed
        if (removed) await AdversarialReview.updateOne({ _id: doc._id }, { $set: { sessionId: null, pendingSessionDeletion: null } })
    }
}
