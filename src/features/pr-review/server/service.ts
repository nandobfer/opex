import { isValidObjectId } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { PrReview, type IPrReview } from "@/lib/db/models/PrReview"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import type { OpencodeFormDto, OpencodePermissionDto } from "@/lib/ai/opencode-events"
import { runAgentTurn } from "@/lib/ai/opencode-run"
import { publishAppEvent } from "@/lib/pusher/channels"
import { loggerFor } from "@/lib/logger"
import { getLocalUser } from "@/lib/local-user"
import { githubPaginate, githubRequest } from "@/features/github/client"
import { toGithubDomainError } from "@/features/github/server/errors"
import { abortWorkbenchRun, clearWorkbenchActive, dropWorkbenchEvents, flushWorkbenchEvents, isWorkbenchActive, markWorkbenchActive, prepareHub, publishWorkbenchEvent } from "@/features/agentic/server/hub"
import type { WorkbenchEventPayload } from "@/features/agentic/types"
import { availabilityOfPrReview, loadPrReviewSettings } from "@/features/ai/server/settings"
import { PR_REVIEW_AUDIT_ENTITY, PR_REVIEW_HISTORY_LIMIT, PR_REVIEW_INSTRUCTIONS_KEY, PR_REVIEW_STAGE_LABEL, PR_REVIEW_UPDATED_EVENT, type PrReviewState, type PrReviewVerdict } from "../constants"
import { parsePrUrl, parseReviewResult, reviewMarker, reviewWorktreePath, verdictFromGithubState } from "../logic"
import { buildPrReviewInstructions, buildPrReviewPrompt } from "../prompt"
import type { PrReviewDetailDto, PrReviewDto, PrReviewListDto } from "../types"
import { enqueueReview, type GithubPullItem } from "./queue"
import { finishReviewSession } from "./session-cleanup"
import { findReviewTarget, githubLogin, listReviewTargets, workbenchPrIndex } from "./targets"

/**
 * Revisão de PR (SOMENTE servidor): cada revisão é um turno do agente numa sessão NOVA do OpenCode,
 * no diretório da central do repositório, que executa a skill de code review e publica o resultado
 * no GitHub. Permissões são aprovadas automaticamente e perguntas são canceladas (não há ninguém para
 * responder). A saída usa o mesmo barramento das mesas (`agentic_events`, chaveado pelo id da revisão).
 */

const log = loggerFor({ module: "pr-review" })
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const actorId = () => getLocalUser().id
const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null)

function toDto(doc: IPrReview): PrReviewDto {
    const startedAt = doc.startedAt ? new Date(doc.startedAt).getTime() : null
    const finishedAt = doc.finishedAt ? new Date(doc.finishedAt).getTime() : null
    return {
        id: String(doc._id),
        repo: doc.repo,
        number: doc.number,
        url: doc.url,
        title: doc.title,
        author: doc.author ?? null,
        headSha: doc.headSha,
        draft: doc.draft === true,
        projectName: doc.projectName,
        workbenchId: doc.workbenchId ?? null,
        trigger: doc.trigger === "manual" ? "manual" : "auto",
        state: doc.state as PrReviewState,
        verdict: (doc.verdict as PrReviewVerdict | null) ?? null,
        blocking: doc.blocking ?? null,
        summary: doc.summary ?? null,
        error: doc.error ?? null,
        costUsd: doc.usage?.costUsd ?? 0,
        durationMs: startedAt && finishedAt ? finishedAt - startedAt : null,
        createdAt: iso(doc.createdAt) ?? new Date().toISOString(),
        startedAt: iso(doc.startedAt),
        finishedAt: iso(doc.finishedAt),
    }
}

async function publishReview(id: string): Promise<void> {
    await publishAppEvent(PR_REVIEW_UPDATED_EVENT, { id }).catch(() => undefined)
}

async function loadReview(id: string): Promise<IPrReview> {
    if (!isValidObjectId(id)) throw new DomainError(404, "Revisão não encontrada", "PR_REVIEW_NOT_FOUND")
    await dbConnect()
    const doc = await PrReview.findById(id).lean()
    if (!doc) throw new DomainError(404, "Revisão não encontrada", "PR_REVIEW_NOT_FOUND")
    return doc as unknown as IPrReview
}

/** Revisões "revisando" sem turno vivo neste processo (o app reiniciou) viram interrompidas. */
async function reconcileRunning(): Promise<void> {
    const running = await PrReview.find({ state: "running" }).select({ _id: 1 }).lean()
    for (const doc of running) {
        const id = String(doc._id)
        if (isWorkbenchActive(id)) continue
        await PrReview.updateOne({ _id: doc._id, state: "running" }, { $set: { state: "interrupted", error: "A execução foi perdida (o app reiniciou durante a revisão). Use Revisar de novo.", finishedAt: new Date() } })
        await publishReview(id)
    }
}

// ── Execução ─────────────────────────────────────────────────────────────────

/** Revisão publicada no GitHub para este commit (pelo marcador oculto), com o veredito do GitHub. */
async function publishedVerdict(doc: IPrReview): Promise<{ found: boolean; verdict: PrReviewVerdict | null }> {
    try {
        const marker = reviewMarker(doc.headSha)
        const [reviews, comments] = await Promise.all([
            githubPaginate<{ state: string; body: string | null }>(`/repos/${doc.repo}/pulls/${doc.number}/reviews?per_page=100`, { maxPages: 5 }),
            githubPaginate<{ body: string | null }>(`/repos/${doc.repo}/issues/${doc.number}/comments?per_page=100`, { maxPages: 5 }),
        ])
        const review = [...reviews].reverse().find((item) => item.body?.includes(marker))
        if (review) return { found: true, verdict: verdictFromGithubState(review.state) }
        return { found: comments.some((item) => item.body?.includes(marker)), verdict: null }
    } catch {
        return { found: false, verdict: null }
    }
}

async function applyInstructions(client: OpencodeClient, sessionId: string, instructions: string): Promise<boolean> {
    if (!instructions) return true
    try {
        await client.session.instructions.entry.put({ sessionID: sessionId, key: PR_REVIEW_INSTRUCTIONS_KEY, value: instructions })
        return true
    } catch {
        return false
    }
}

async function executeReview(id: string, controller: AbortController): Promise<void> {
    const doc = await loadReview(id)
    const { settings } = await loadPrReviewSettings()
    const target = await findReviewTarget(doc.repo)
    if (!target) throw new Error(`O repositório ${doc.repo} não está vinculado a uma central de desenvolvimento ativa`)
    const config = target.config
    const root = config.worktreeRoot || `${config.sessionDirectory}/worktrees`
    const myLogin = await githubLogin()
    const client = await getOpencodeClient()
    const session = await client.session.create({ title: `Revisão · ${doc.repo}#${doc.number}: ${doc.title}`.slice(0, 120), location: { directory: config.sessionDirectory }, metadata: { app: "opex", kind: "pr-review", reviewId: id } })
    await PrReview.updateOne({ _id: id }, { $set: { sessionId: session.id } })

    const instructions = buildPrReviewInstructions(settings.instructions)
    const applied = await applyInstructions(client, session.id, instructions)
    const prompt = buildPrReviewPrompt({
        repo: doc.repo,
        number: doc.number,
        url: doc.url,
        title: doc.title,
        author: doc.author,
        baseRef: doc.baseRef || "a branch de destino",
        headSha: doc.headSha,
        sessionDirectory: config.sessionDirectory,
        worktreePath: reviewWorktreePath(root, doc.repo, doc.number, doc.headSha),
        skill: settings.skill,
        ownPr: Boolean(myLogin && doc.author && myLogin.toLowerCase() === doc.author.toLowerCase()),
        mention: doc.workbenchId ? "@opex" : null,
    })
    const publish = (event: WorkbenchEventPayload) => publishWorkbenchEvent(id, event)
    const filter = { _id: id }
    let text = ""
    const result = await runAgentTurn(
        client,
        {
            id,
            sessionId: session.id,
            stage: PR_REVIEW_STAGE_LABEL,
            title: `${PR_REVIEW_STAGE_LABEL} · #${doc.number}`,
            agent: { agent: settings.agent, model: settings.model, variant: settings.variant },
            text: applied || !instructions ? prompt : `${instructions}\n\n---\n${prompt}`,
            timeoutMs: settings.timeoutMinutes * 60_000,
            signal: controller.signal,
            consumption: { origin: "pr-review", subject: `${doc.repo}#${doc.number}` },
        },
        {
            publish,
            // Sem ninguém para responder: permissões são aprovadas na hora e perguntas, canceladas.
            onPermission: async (permission: OpencodePermissionDto) => {
                await client.permission.reply({ sessionID: session.id, requestID: permission.id, decision: "once" }).catch((error) => log.warn({ err: errorText(error), reviewId: id }, "[pr-review] falha ao aprovar a permissão"))
                publish({ type: "permission-replied", id: permission.id, decision: "once" })
                publish({ type: "notice", level: "info", message: `Permissão aprovada automaticamente: ${permission.action}${permission.resources.length ? ` (${permission.resources.join(", ")})` : ""}` })
            },
            onForm: async (form: OpencodeFormDto) => {
                await client.session.form.cancel({ sessionID: session.id, formID: form.id }).catch(() => undefined)
                publish({ type: "form-closed", id: form.id })
                publish({ type: "notice", level: "warn", message: "O agente fez uma pergunta, mas a revisão roda sem ninguém para responder: pergunta dispensada" })
            },
            onText: (delta: string) => {
                text += delta
            },
            onStep: async ({ costUsd, tokens }) => {
                await PrReview.updateOne(filter, { $inc: { "usage.costUsd": costUsd, "usage.inputTokens": tokens.input, "usage.outputTokens": tokens.output, "usage.reasoningTokens": tokens.reasoning } })
            },
            heartbeat: async () => {
                await PrReview.updateOne(filter, { $set: { heartbeatAt: new Date() } })
            },
        },
    )
    await flushWorkbenchEvents(id)
    const output = result.text || text
    const parsed = parseReviewResult(output)
    const succeeded = result.outcome === "succeeded"
    const published = succeeded ? await publishedVerdict(doc) : { found: false, verdict: null }
    // O agente sabe se houve bloqueio mesmo quando só pôde comentar (PR próprio); o GitHub confirma a publicação.
    const verdict = parsed.verdict ?? published.verdict
    const state: PrReviewState = succeeded ? "done" : result.outcome === "interrupted" ? "interrupted" : "failed"
    const error = succeeded ? (published.found ? null : "A revisão não foi encontrada no GitHub (o agente pode não tê-la publicado)") : (result.message ?? "O agente não concluiu a revisão")
    await PrReview.updateOne(filter, { $set: { state, verdict, blocking: parsed.blocking, summary: parsed.summary, report: parsed.report || null, error, finishedAt: new Date() } })
    await recordAudit({ userId: actorId(), entidade: PR_REVIEW_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { pr: `${doc.repo}#${doc.number}`, commit: doc.headSha.slice(0, 7), estado: state, veredito: verdict } })
    log.info({ reviewId: id, state, verdict, costUsd: result.costUsd }, `${PR_REVIEW_STAGE_LABEL} ${doc.repo}#${doc.number}: ${state}`)
    await finishReviewSession(id, session.id)
}

/** Inicia a revisão em segundo plano; ao terminar, puxa a próxima da fila. */
async function launchReview(id: string): Promise<boolean> {
    if (isWorkbenchActive(id)) return false
    const claimed = await PrReview.updateOne({ _id: id, state: "queued" }, { $set: { state: "running", startedAt: new Date(), finishedAt: null, heartbeatAt: new Date(), error: null } })
    if (!claimed.modifiedCount) return false
    await prepareHub(id)
    const controller = new AbortController()
    markWorkbenchActive(id, controller)
    await publishReview(id)
    void executeReview(id, controller)
        .catch(async (error) => {
            log.error({ err: errorText(error), reviewId: id }, "[pr-review] falha na revisão")
            publishWorkbenchEvent(id, { type: "notice", level: "error", message: errorText(error) })
            await flushWorkbenchEvents(id).catch(() => undefined)
            await PrReview.updateOne({ _id: id }, { $set: { state: "failed", error: errorText(error), finishedAt: new Date() } }).catch(() => undefined)
            const doc = await PrReview.findById(id).select({ sessionId: 1 }).lean()
            if (doc?.sessionId) await finishReviewSession(id, doc.sessionId)
        })
        .finally(() => {
            clearWorkbenchActive(id, controller)
            void publishReview(id)
            void pumpPrReviews().catch(() => undefined)
        })
    return true
}

let pumping: Promise<number> | null = null

/** Inicia as revisões da fila (mais antigas primeiro) até o limite de simultâneas. */
export function pumpPrReviews(): Promise<number> {
    pumping ??= (async () => {
        try {
            await dbConnect()
            await reconcileRunning()
            const { settings } = await loadPrReviewSettings()
            if (!(await availabilityOfPrReview(settings)).available) return 0
            const running = await PrReview.countDocuments({ state: "running" })
            const slots = settings.maxConcurrent - running
            if (slots <= 0) return 0
            const queued = await PrReview.find({ state: "queued" }).sort({ createdAt: 1 }).limit(slots).select({ _id: 1 }).lean()
            let started = 0
            for (const doc of queued) if (await launchReview(String(doc._id))) started++
            return started
        } finally {
            pumping = null
        }
    })()
    return pumping
}

// ── Consultas e ações (tela) ─────────────────────────────────────────────────

export async function listPrReviews(): Promise<PrReviewListDto> {
    await dbConnect()
    await reconcileRunning()
    const [docs, githubLoginValue, targets] = await Promise.all([PrReview.find().sort({ createdAt: -1 }).limit(PR_REVIEW_HISTORY_LIMIT).lean(), githubLogin(), listReviewTargets({ all: true })])
    return {
        items: (docs as unknown as IPrReview[]).map(toDto),
        githubLogin: githubLoginValue,
        repos: targets.map((target) => ({ repo: target.repo, projectName: target.projectName, enabled: target.config.enabled })),
    }
}

export async function getPrReview(id: string): Promise<PrReviewDetailDto> {
    const doc = await loadReview(id)
    return { ...toDto(doc), report: doc.report ?? null }
}

async function assertAvailable(): Promise<void> {
    const { settings } = await loadPrReviewSettings()
    const availability = await availabilityOfPrReview(settings)
    if (!availability.available) throw new DomainError(409, availability.reason ?? "Revisão de PR indisponível", "PR_REVIEW_UNAVAILABLE")
}

async function fetchPull(repo: string, number: number): Promise<GithubPullItem & { state: string }> {
    try {
        return await githubRequest<GithubPullItem & { state: string }>(`/repos/${repo}/pulls/${number}`)
    } catch (error) {
        return toGithubDomainError(error)
    }
}

/**
 * Revisa o commit atual do PR (manual). Revisão já existente do mesmo commit e não em andamento é
 * refeita do zero; senão uma nova entra na fila.
 */
async function queueManual(repo: string, number: number): Promise<string> {
    const target = await findReviewTarget(repo)
    if (!target) throw new DomainError(400, `O repositório ${repo} não está vinculado a uma central de desenvolvimento ativa`, "PR_REVIEW_REPO_NOT_LINKED")
    const pull = await fetchPull(target.repo, number)
    if (pull.state !== "open") throw new DomainError(409, `O PR #${number} não está aberto`, "PR_REVIEW_PR_CLOSED")
    const workbenchId = (await workbenchPrIndex()).get(`${target.repo}#${number}`) ?? null
    const { result, id } = await enqueueReview({ target, pull, workbenchId }, "manual")
    if (result === "exists") {
        const doc = await loadReview(id)
        if (doc.state === "running" || isWorkbenchActive(id)) throw new DomainError(409, "Este PR já está sendo revisado", "PR_REVIEW_BUSY")
        if (doc.state !== "queued") {
            await dropWorkbenchEvents(id)
            await PrReview.updateOne(
                { _id: id },
                { $set: { state: "queued", trigger: "manual", verdict: null, blocking: null, summary: null, report: null, error: null, startedAt: null, finishedAt: null, usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 } } },
            )
        }
    }
    await recordAudit({ userId: actorId(), entidade: PR_REVIEW_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.CRIAR, depois: { pr: `${target.repo}#${number}`, commit: pull.head?.sha?.slice(0, 7) ?? null, origem: "manual" } })
    await publishReview(id)
    await pumpPrReviews()
    return id
}

/** "Revisar PR" pela URL. */
export async function requestPrReview(url: string): Promise<PrReviewDetailDto> {
    await assertAvailable()
    const parsed = parsePrUrl(url)
    if (!parsed) throw new DomainError(400, "URL de PR inválida", "PR_REVIEW_INVALID_URL")
    return getPrReview(await queueManual(parsed.repo, parsed.number))
}

/** "Revisar de novo": revisa o commit atual do PR (o mesmo ou um mais novo). */
export async function rerunPrReview(id: string): Promise<PrReviewDetailDto> {
    await assertAvailable()
    const doc = await loadReview(id)
    if (doc.state === "running") throw new DomainError(409, "Este PR já está sendo revisado", "PR_REVIEW_BUSY")
    return getPrReview(await queueManual(doc.repo, doc.number))
}

/** "Parar": tira da fila ou interrompe a revisão em andamento. */
export async function stopPrReview(id: string): Promise<PrReviewDetailDto> {
    const doc = await loadReview(id)
    if (doc.state === "queued") {
        await PrReview.updateOne({ _id: id, state: "queued" }, { $set: { state: "interrupted", error: "Removida da fila pelo usuário", finishedAt: new Date() } })
    } else if (doc.state === "running") {
        if (doc.sessionId) await (await getOpencodeClient()).session.interrupt({ sessionID: doc.sessionId }).catch(() => undefined)
        abortWorkbenchRun(id, "Interrompida pelo usuário")
        if (!isWorkbenchActive(id)) await reconcileRunning()
    } else {
        throw new DomainError(409, "A revisão não está na fila nem em andamento", "PR_REVIEW_NOT_RUNNING")
    }
    log.warn({ reviewId: id }, `${PR_REVIEW_STAGE_LABEL} ${doc.repo}#${doc.number}: parada pelo usuário`)
    await recordAudit({ userId: actorId(), entidade: PR_REVIEW_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { estado: doc.state }, depois: { acao: "parar", pr: `${doc.repo}#${doc.number}` } })
    await publishReview(id)
    return getPrReview(id)
}
