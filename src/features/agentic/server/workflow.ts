import { isValidObjectId } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AgenticWorkbench, type IAgenticWorkbench, type IWorkbenchPr } from "@/lib/db/models/Agentic"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { getLocalUser } from "@/lib/local-user"
import { buildUnderstandTaskPrompt } from "@/features/ai/understand-task"
import { getTask, moveTask } from "@/features/tasks/server/service"
import { githubRequest } from "@/features/github/client"
import { accumulateWorkPeriodUsage } from "@/features/time/server/service"
import type { TaskDetailDto } from "@/features/tasks/types"
import { AGENTIC_AUDIT_WORKBENCH, RUNNING_STAGES, STAGE_ROLE, WORKBENCH_STAGE_LABELS, type WorkbenchStage } from "../constants"
import { asAgenticFlow, canRun, reopenTargetColumn, resolveAgent, type WorkbenchAction } from "../logic"
import {
    branchNameFor,
    buildPrompt,
    cleanupPrompt,
    composeProjectFor,
    deletePrBranchPrompt,
    extractJsonBlock,
    extractPrUrl,
    implementPrompt,
    mergePrPrompt,
    planPrompt,
    prChangesPrompt,
    previewCorrectionPrompt,
    prPrompt,
    reopenPrompt,
    revisePlanPrompt,
    worktreePathFor,
    conflictPrompt,
    type WorkbenchContext,
} from "../prompts"
import { buildResultSchema, conflictResultSchema, prResultSchema, type CentralConfig, type FormReplyInput, type PermissionReplyInput } from "../schemas"
import type { WorkbenchDto, WorkbenchSummaryDto } from "../types"
import { buildQueuePosition, buildQueuePositions, pumpBuildQueue } from "./build-queue"
import { entryColumnForProject, loadCentral, publishAgentic, repoForProject } from "./centrals"
import { asRunState, asStage, toWorkbenchDto, toWorkbenchSummary } from "./dto"
import { abortWorkbenchRun, clearWorkbenchActive, dropWorkbenchEvents, flushWorkbenchEvents, isWorkbenchActive, markWorkbenchActive, prepareHub, publishWorkbenchEvent } from "./hub"
import { centralLogger } from "./log"
import { allocatePreviewPort, releasePreviewPort, waitForPreview } from "./ports"
import { runAgentTurn, type TurnResult } from "./runner"
import { deleteWorkbenchSession, flushPendingSessionDeletions } from "./session-cleanup"
import { agenticAvailability, loadAgenticSettings } from "./settings"
import { syncWorkbenchTimer } from "./timer-sync"

/**
 * Fluxo da mesa de trabalho: planejar → (corrigir) → implementar → subir a prévia → (corrigir) →
 * abrir o PR → acompanhar → concluir. Cada etapa de execução é um turno do agente na MESMA sessão
 * do OpenCode, rodando em segundo plano no servidor (fechar a tela não para a IA).
 */

const TURN_TIMEOUT_MS = 3 * 60 * 60_000

const actorId = () => getLocalUser().id
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

function assertId(id: string): void {
    if (!isValidObjectId(id)) throw new DomainError(404, "Mesa de trabalho não encontrada", "WORKBENCH_NOT_FOUND")
}

async function loadWorkbench(id: string): Promise<IAgenticWorkbench> {
    assertId(id)
    await dbConnect()
    const doc = await AgenticWorkbench.findById(id).lean()
    if (!doc) throw new DomainError(404, "Mesa de trabalho não encontrada", "WORKBENCH_NOT_FOUND")
    return doc
}

async function update(doc: Pick<IAgenticWorkbench, "_id" | "centralId" | "taskId">, set: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<void> {
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: set, ...extra })
    // O apontamento agêntico acompanha o estado da mesa (abre/atualiza/fecha o período).
    await syncWorkbenchTimer(String(doc._id))
    await publishAgentic({ centralId: doc.centralId, workbenchId: String(doc._id), taskId: doc.taskId })
}

/** Mesa "executando" sem turno vivo neste processo (o app reiniciou): vira interrompida. */
async function reconcile(doc: IAgenticWorkbench): Promise<IAgenticWorkbench> {
    const id = String(doc._id)
    if (doc.runState !== "running" || isWorkbenchActive(id)) return doc
    const error = "A execução foi perdida neste app (o app reiniciou durante a etapa). Tente novamente ou reconecte se o agente ainda estiver rodando."
    await AgenticWorkbench.updateOne({ _id: doc._id, runState: "running" }, { $set: { runState: "interrupted", error, pendingPermissions: [], pendingForms: [] } })
    await syncWorkbenchTimer(String(doc._id))
    return { ...doc, runState: "interrupted", error, pendingPermissions: [], pendingForms: [] }
}

export async function getWorkbench(id: string): Promise<WorkbenchDto> {
    const doc = await reconcile(await loadWorkbench(id))
    return toWorkbenchDto(doc, await buildQueuePosition(id))
}

export async function getWorkbenchByTask(taskId: string): Promise<WorkbenchDto | null> {
    await dbConnect()
    const doc = await AgenticWorkbench.findOne({ taskId }).lean()
    if (!doc) return null
    return toWorkbenchDto(await reconcile(doc), await buildQueuePosition(String(doc._id)))
}

export async function listCentralWorkbenches(centralId: string): Promise<WorkbenchSummaryDto[]> {
    await dbConnect()
    const [docs, positions] = await Promise.all([
        AgenticWorkbench.find({ centralId }).select({ taskId: 1, taskCode: 1, taskTitle: 1, stage: 1, runState: 1, pendingPermissions: 1, pendingForms: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).lean(),
        buildQueuePositions(),
    ])
    return docs.map((doc) => {
        const reconciled = doc.runState === "running" && !isWorkbenchActive(String(doc._id)) ? { ...doc, runState: "interrupted" } : doc
        return toWorkbenchSummary(reconciled, positions.get(String(doc._id)) ?? null)
    })
}

interface Loaded {
    doc: IAgenticWorkbench
    config: CentralConfig
    projectName: string
    projectId: string
    repo: { repo: string; repoUrl: string } | null
}

async function loadAll(id: string): Promise<Loaded> {
    const doc = await loadWorkbench(id)
    const { doc: central, config } = await loadCentral(doc.centralId)
    return { doc, config, projectName: central.projectName, projectId: central.projectId, repo: await repoForProject(central.projectId) }
}

function contextOf({ doc, config, projectName, repo }: Loaded): WorkbenchContext {
    return {
        code: doc.taskCode,
        title: doc.taskTitle,
        projectName,
        repo: repo?.repo ?? null,
        sessionDirectory: config.sessionDirectory,
        worktreePath: doc.worktreePath ?? worktreePathFor(config, doc.taskCode),
        branch: doc.branch ?? branchNameFor(config, { code: doc.taskCode, title: doc.taskTitle }),
        composeProject: doc.composeProject ?? composeProjectFor(projectName, doc.taskCode),
    }
}

function assertAction(doc: IAgenticWorkbench, action: WorkbenchAction): void {
    const stage = asStage(doc.stage)
    const runState = isWorkbenchActive(String(doc._id)) ? "running" : asRunState(doc.runState) === "running" ? "interrupted" : asRunState(doc.runState)
    if (!canRun(stage, runState, action)) {
        throw new DomainError(409, `Ação indisponível na etapa "${WORKBENCH_STAGE_LABELS[stage]}"${runState === "running" ? " (o agente está trabalhando)" : ""}`, "WORKBENCH_INVALID_STATE")
    }
}

async function assertAvailable(centralId: string, workbenchId: string | null, config: CentralConfig): Promise<void> {
    await assertAgenticReady(config)
    // O limite é de mesas ABERTAS (não concluídas); a própria mesa não conta ao retomar um turno.
    const open = await AgenticWorkbench.countDocuments({ centralId, stage: { $ne: "done" }, ...(workbenchId ? { _id: { $ne: workbenchId } } : {}) })
    if (open >= config.maxConcurrent) throw new DomainError(409, `Limite de ${config.maxConcurrent} mesa(s) abertas ao mesmo tempo nesta central`, "CENTRAL_BUSY")
}

/** Disponibilidade para executar algo na central (feature/OpenCode + central ativa). Sem o limite de mesas. */
async function assertAgenticReady(config: CentralConfig): Promise<void> {
    const { settings } = await loadAgenticSettings()
    const availability = await agenticAvailability(settings)
    if (!availability.available) throw new DomainError(409, availability.reason ?? "Desenvolvimento agêntico indisponível", "AGENTIC_UNAVAILABLE")
    if (!config.enabled) throw new DomainError(409, "A central está desativada em Integrações › Provedores de IA", "CENTRAL_DISABLED")
}

/** Abre a próxima mesa da fila da central (import dinâmico evita o ciclo estático com `queue.ts`). */
function pumpQueue(centralId: string): void {
    void import("./queue")
        .then((queue) => queue.pumpCentralQueue(centralId))
        .catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------

interface TurnPlan {
    stage: WorkbenchStage
    text: string
    /** Reconexão: acompanha a execução em andamento sem enviar prompt nem trocar agente/modelo. */
    attach?: boolean
}

interface LaunchOptions {
    /** Texto do usuário exibido na mesa antes do turno. */
    userText?: string
    /** Pedido que origina a próxima versão do plano. */
    feedback?: string | null
    extraSet?: Record<string, unknown>
}

/** Inicia um turno em segundo plano (as rotas respondem na hora; a saída chega pelo stream). */
async function launchTurn(loaded: Loaded, turn: TurnPlan, options: LaunchOptions = {}): Promise<void> {
    const id = String(loaded.doc._id)
    if (isWorkbenchActive(id)) throw new DomainError(409, "O agente já está trabalhando nesta mesa", "WORKBENCH_BUSY")
    // A reconexão não abre uma mesa nova: só a disponibilidade importa (o limite de mesas não se aplica).
    if (turn.attach) await assertAgenticReady(loaded.config)
    else await assertAvailable(loaded.doc.centralId, id, loaded.config)
    await prepareHub(id)
    if (options.userText) publishWorkbenchEvent(id, { type: "user", text: options.userText })
    const controller = new AbortController()
    markWorkbenchActive(id, controller)
    try {
        await update(loaded.doc, {
            stage: turn.stage,
            runState: "running",
            error: null,
            heartbeatAt: new Date(),
            // Reconectar preserva o turno original (o "Tentar novamente" e o marco de tempo continuam válidos).
            ...(turn.attach ? {} : { lastStage: turn.stage, lastPrompt: { stage: turn.stage, text: turn.text }, turnStartedAt: new Date() }),
            ...(options.feedback !== undefined ? { pendingFeedback: options.feedback } : {}),
            ...options.extraSet,
        })
    } catch (error) {
        clearWorkbenchActive(id, controller)
        throw error
    }
    void executeTurns(id, turn, controller)
        .catch((error) => centralLogger(loaded.doc.centralId, loaded.doc.taskCode).error("Falha inesperada na mesa", error))
        .finally(() => {
            clearWorkbenchActive(id, controller)
            // Terminou um build (liberou a vaga) ou uma implementação (entrou na fila): avalia a fila do build.
            if (turn.stage === "building" || turn.stage === "implementing") pumpBuildQueue()
        })
}

/** Executa o turno e os encadeados (implementação → build), mantendo a mesa ativa entre eles. */
async function executeTurns(id: string, first: TurnPlan, controller: AbortController): Promise<void> {
    let turn: TurnPlan | null = first
    while (turn) {
        const loaded = await loadAll(id)
        const log = centralLogger(loaded.doc.centralId, loaded.doc.taskCode)
        if (turn !== first) await update(loaded.doc, { stage: turn.stage, runState: "running", error: null, lastStage: turn.stage, lastPrompt: { stage: turn.stage, text: turn.text }, heartbeatAt: new Date() })
        let next: TurnPlan | null = null
        try {
            const client = await getOpencodeClient()
            const sessionId = turn.attach ? loaded.doc.sessionId : await ensureSession(client, loaded)
            if (!sessionId) throw new Error("A mesa não tem uma sessão do OpenCode para reconectar")
            const { settings } = await loadAgenticSettings()
            const role = STAGE_ROLE[turn.stage] ?? "planning"
            const agent = resolveAgent(settings, loaded.config, role)
            log.step(`${WORKBENCH_STAGE_LABELS[turn.stage]}: turno iniciado`, { workbenchId: id, agent: agent.agent, model: agent.model })
            const result = await runAgentTurn(
                client,
                {
                    workbenchId: id,
                    sessionId,
                    stage: turn.stage,
                    title: WORKBENCH_STAGE_LABELS[turn.stage],
                    agent,
                    text: turn.text,
                    timeoutMs: turn.stage === "building" ? loaded.config.environment.buildTimeoutMinutes * 60_000 : TURN_TIMEOUT_MS,
                    signal: controller.signal,
                    attach: turn.attach,
                    startedAt: loaded.doc.turnStartedAt ? new Date(loaded.doc.turnStartedAt).getTime() : 0,
                },
                turnHooks(loaded.doc),
            )
            await AgenticWorkbench.updateOne({ _id: loaded.doc._id }, { $set: { pendingPermissions: [], pendingForms: [] } })
            await flushWorkbenchEvents(id)
            log[result.outcome === "succeeded" ? "success" : "warn"](`${WORKBENCH_STAGE_LABELS[turn.stage]}: ${result.outcome === "succeeded" ? "concluído" : (result.message ?? result.outcome)}`, {
                workbenchId: id,
                durationMs: result.durationMs,
                costUsd: result.costUsd,
            })
            if (result.outcome !== "succeeded") {
                await update(loaded.doc, { runState: result.outcome === "interrupted" ? "interrupted" : "failed", error: result.message ?? "O agente não concluiu a etapa" })
                return
            }
            next = await afterTurn(client, await loadAll(id), turn.stage, result)
        } catch (error) {
            log.error(`${WORKBENCH_STAGE_LABELS[turn.stage]}: falhou`, error, { workbenchId: id })
            await prepareHub(id)
            publishWorkbenchEvent(id, { type: "notice", level: "error", message: errorText(error) })
            await flushWorkbenchEvents(id)
            await update(loaded.doc, { runState: "failed", error: errorText(error), pendingPermissions: [], pendingForms: [] })
            return
        }
        turn = controller.signal.aborted ? null : next
    }
}

function turnHooks(doc: IAgenticWorkbench) {
    const filter = { _id: doc._id }
    const changed = () => publishAgentic({ centralId: doc.centralId, workbenchId: String(doc._id), taskId: doc.taskId })
    return {
        onPermission: async (permission: unknown) => {
            // Deduplica por id: a reconexão pode reenviar uma permissão que já está pendente.
            await AgenticWorkbench.updateOne(filter, { $pull: { pendingPermissions: { id: (permission as { id?: string }).id } } })
            await AgenticWorkbench.updateOne(filter, { $push: { pendingPermissions: permission } })
            await syncWorkbenchTimer(String(doc._id))
            await changed()
        },
        onPermissionClosed: async (requestId: string) => {
            await AgenticWorkbench.updateOne(filter, { $pull: { pendingPermissions: { id: requestId } } })
            await syncWorkbenchTimer(String(doc._id))
            await changed()
        },
        onForm: async (form: unknown) => {
            // Deduplica por id: a reconexão pode reenviar uma pergunta que já está pendente.
            await AgenticWorkbench.updateOne(filter, { $pull: { pendingForms: { id: (form as { id?: string }).id } } })
            await AgenticWorkbench.updateOne(filter, { $push: { pendingForms: form } })
            await syncWorkbenchTimer(String(doc._id))
            await changed()
        },
        onFormClosed: async (formId: string) => {
            await AgenticWorkbench.updateOne(filter, { $pull: { pendingForms: { id: formId } } })
            await syncWorkbenchTimer(String(doc._id))
            await changed()
        },
        onStep: async ({ costUsd, tokens }: { costUsd: number; tokens: { input: number; output: number; reasoning: number } }) => {
            await AgenticWorkbench.updateOne(filter, { $inc: { "usage.costUsd": costUsd, "usage.inputTokens": tokens.input, "usage.outputTokens": tokens.output, "usage.reasoningTokens": tokens.reasoning } })
            await accumulateWorkPeriodUsage(String(doc._id), { costUsd, inputTokens: tokens.input, outputTokens: tokens.output, reasoningTokens: tokens.reasoning })
        },
        onMoved: async (directory: string) => {
            await AgenticWorkbench.updateOne(filter, { $set: { sessionDirectory: directory } })
            await changed()
        },
        heartbeat: async () => {
            await AgenticWorkbench.updateOne(filter, { $set: { heartbeatAt: new Date() } })
        },
    }
}

/** Sessão da mesa: a gravada (se ainda existir no OpenCode) ou uma nova no diretório da central. */
async function ensureSession(client: OpencodeClient, { doc, config }: Loaded): Promise<string> {
    if (doc.sessionId) {
        const info = await client.session.get({ sessionID: doc.sessionId }).catch(() => null)
        if (info) return doc.sessionId
        publishWorkbenchEvent(String(doc._id), { type: "notice", level: "warn", message: "A sessão anterior não existe mais no OpenCode: uma nova sessão foi criada (o histórico da conversa recomeça)" })
    }
    const directory = doc.sessionId && doc.sessionDirectory ? doc.sessionDirectory : config.sessionDirectory
    const session = await client.session.create({ title: `${doc.taskCode} · ${doc.taskTitle}`.slice(0, 120), location: { directory }, metadata: { app: "opex", taskId: doc.taskId } })
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { sessionId: session.id, sessionDirectory: session.location?.directory ?? directory } })
    return session.id
}

/** Resultado de um turno bem-sucedido → próxima etapa (ou o próximo turno encadeado). */
async function afterTurn(client: OpencodeClient, loaded: Loaded, stage: WorkbenchStage, result: TurnResult): Promise<TurnPlan | null> {
    const { doc, config } = loaded
    const id = String(doc._id)
    const notice = (level: "info" | "warn" | "success" | "error", message: string) => publishWorkbenchEvent(id, { type: "notice", level, message })
    const ctx = contextOf(loaded)

    switch (stage) {
        case "planning": {
            const text = result.text.trim()
            if (!text) throw new Error("O planejador não devolveu um plano")
            const version = (doc.plans?.length ?? 0) + 1
            await update(doc, { stage: "plan_review", runState: "idle", pendingFeedback: null }, { $push: { plans: { version, text, feedback: doc.pendingFeedback ?? null, createdAt: new Date() } } })
            return null
        }
        case "implementing": {
            const info = await client.session.get({ sessionID: doc.sessionId! }).catch(() => null)
            const directory = info?.location?.directory ?? doc.sessionDirectory
            if (directory !== ctx.worktreePath) {
                notice("warn", `A sessão não foi movida para o worktree; movendo para ${ctx.worktreePath}`)
                await client.session.move({ sessionID: doc.sessionId!, directory: ctx.worktreePath })
            }
            await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { sessionDirectory: ctx.worktreePath } })
            // Fluxo PR automático: pula a prévia e encadeia a abertura do PR na mesma sessão.
            if (asAgenticFlow(doc.agenticFlow) === "auto_pr") {
                const pr = doc.pr && doc.pr.state === "open" ? { number: doc.pr.number, url: doc.pr.url } : null
                notice("info", "Fluxo PR automático: pulando a prévia e abrindo o Pull Request.")
                return { stage: "opening_pr", text: prPrompt(config, ctx, { code: doc.taskCode, title: doc.taskTitle }, pr, { fromPreview: false }) }
            }
            // Entra na fila global do build (um build por vez); a porta é reservada quando a vez chega.
            await update(doc, { stage: "build_queued", runState: "idle", buildQueuedAt: new Date() })
            notice("info", "Implementação concluída. Aguardando a vez do build — um build por vez.")
            return null
        }
        case "building": {
            const parsed = buildResultSchema.safeParse(extractJsonBlock(result.text))
            if (parsed.success && !parsed.data.ok) throw new Error(`O build falhou: ${parsed.data.error ?? "motivo não informado"}`)
            const fresh = await AgenticWorkbench.findById(id).select({ port: 1 }).lean()
            if (typeof fresh?.port !== "number") throw new Error("A mesa ficou sem porta reservada")
            const env = config.environment
            const previewUrl = `http://${env.previewHost}:${fresh.port}`
            const healthy = await waitForPreview(`${previewUrl}${env.healthPath || "/"}`)
            if (!healthy && !parsed.success) throw new Error(`A prévia não respondeu em ${previewUrl}`)
            notice(healthy ? "success" : "warn", healthy ? `Prévia no ar em ${previewUrl}` : `O agente concluiu o build, mas ${previewUrl} não respondeu ao app`)
            await update(doc, { stage: "preview", runState: "idle", previewUrl, previewHealthy: healthy })
            return null
        }
        case "opening_pr": {
            const parsed = prResultSchema.safeParse(extractJsonBlock(result.text))
            const found = parsed.success ? { url: parsed.data.url, number: parsed.data.number ?? extractPrUrl(parsed.data.url)?.number } : extractPrUrl(result.text)
            if (!found?.url || !found.number) throw new Error("O agente não informou a URL do Pull Request")
            const keep = doc.pr && doc.pr.number === found.number
            const pr: IWorkbenchPr = keep ? { ...doc.pr!, url: found.url, state: "open" } : { number: found.number, url: found.url, state: "open", mergedAt: null, mergeCommitSha: null, lastReviewId: 0, lastCommentId: 0, closedNotified: false, conflictBaseSha: null, conflictHeadSha: null }
            notice("success", keep ? `PR #${pr.number} atualizado` : `PR #${pr.number} aberto: ${pr.url}`)
            await update(doc, { stage: "pr_open", runState: "idle", pr })
            const prColumn = config.columns.onPr
            if (prColumn) {
                try {
                    await moveTask(doc.taskId, { targetColumn: prColumn }, actorId())
                    notice("info", "Tarefa movida para a coluna do Pull Request")
                } catch (error) {
                    notice("warn", `Não foi possível mover a tarefa: ${errorText(error)}`)
                }
            }
            await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: doc.taskCode, pr: pr.url } })
            return null
        }
        case "resolving_conflicts": {
            const parsed = conflictResultSchema.safeParse(extractJsonBlock(result.text))
            if (!parsed.success || !parsed.data.ok) {
                throw new Error(`A resolução do conflito não foi concluída: ${parsed.success ? (parsed.data.error ?? "o agente não confirmou a publicação") : "resposta sem o bloco JSON esperado"}`)
            }
            notice("success", `Conflito de merge do PR #${doc.pr?.number ?? ""} resolvido e enviado (push). O PR volta a aguardar revisão/merge.`)
            if (doc.previewHealthy) notice("warn", "A prévia pode estar desatualizada em relação ao código publicado na resolução do conflito.")
            // Volta a acompanhar o PR; a prévia aprovada deixa de valer para o código novo, quando havia uma.
            await update(doc, { stage: "pr_open", runState: "idle", ...(doc.previewHealthy ? { previewHealthy: false } : {}) })
            return null
        }
        case "merging_pr": {
            const parsed = buildResultSchema.safeParse(extractJsonBlock(result.text))
            if (parsed.success && !parsed.data.ok) throw new Error(`O merge não foi concluído: ${parsed.data.error ?? "motivo não informado"}`)
            const pr = doc.pr
            if (!pr) throw new Error("A mesa não tem um Pull Request para mergear")
            if (!ctx.repo) throw new Error("A mesa não tem um repositório do GitHub vinculado")
            const pull = await fetchPullMerge(ctx.repo, pr.number)
            // O bloco JSON do agente não basta: o merge é confirmado no GitHub antes de concluir.
            if (!pull.merged) throw new Error(`O GitHub não confirmou o merge do PR #${pr.number}. Verifique se ele ainda tem bloqueios (verificações, revisões obrigatórias ou regras de branch).`)
            const merged: IWorkbenchPr = { ...pr, state: "merged", mergedAt: pull.merged_at ? new Date(pull.merged_at) : new Date(), mergeCommitSha: pull.merge_commit_sha }
            const headBranch = pull.head?.ref ?? null
            if (config.git.autoMerge && doc.branch && headBranch === doc.branch) {
                await update(doc, { pr: merged })
                notice("info", `PR #${pr.number} mergeado; apagando a branch remota ${headBranch}.`)
                return { stage: "deleting_pr_branch", text: deletePrBranchPrompt(config, ctx, { number: pr.number, url: pr.url, branch: headBranch }) }
            }
            if (config.git.autoMerge && headBranch && headBranch !== doc.branch) {
                notice("warn", `A branch do PR (${headBranch}) não é a esperada (${doc.branch}); a exclusão automática da branch remota foi cancelada.`)
            }
            const next = await afterMerge(loaded, merged)
            if (next) return next
            await completeWorkbench({ ...doc, pr: merged })
            return null
        }
        case "deleting_pr_branch": {
            const parsed = buildResultSchema.safeParse(extractJsonBlock(result.text))
            if (parsed.success && !parsed.data.ok) throw new Error(`A exclusão da branch remota não foi concluída: ${parsed.data.error ?? "motivo não informado"}`)
            const pr = doc.pr
            if (!pr) throw new Error("A mesa não tem um Pull Request para concluir")
            const merged: IWorkbenchPr = { ...pr, state: "merged", mergedAt: pr.mergedAt ?? new Date(), mergeCommitSha: pr.mergeCommitSha ?? null }
            const next = await afterMerge(loaded, merged)
            if (next) return next
            await completeWorkbench({ ...doc, pr: merged })
            return null
        }
        case "finishing": {
            const parsed = buildResultSchema.safeParse(extractJsonBlock(result.text))
            if (parsed.success && !parsed.data.ok) notice("warn", `Limpeza incompleta: ${parsed.data.error ?? "motivo não informado"}`)
            await completeWorkbench(doc)
            return null
        }
        default:
            return null
    }
}

async function completeWorkbench(doc: IAgenticWorkbench): Promise<void> {
    await releasePreviewPort(String(doc._id))
    const sessionId = doc.sessionId
    // A mesa concluiu: desvincula a sessão e a registra como pendente de exclusão na MESMA atualização
    // (a exclusão em si é tentada logo abaixo; se falhar, a pendência é retomada pela rotina de Crons).
    await update(
        doc,
        { stage: "done", runState: "idle", completedAt: new Date(), error: null, previewUrl: null, previewHealthy: null, sessionId: null, sessionDirectory: null },
        sessionId ? { $addToSet: { pendingSessionDeletions: sessionId } } : {},
    )
    publishWorkbenchEvent(String(doc._id), { type: "notice", level: "success", message: "Mesa de trabalho concluída" })
    centralLogger(doc.centralId, doc.taskCode).success("Mesa concluída", { workbenchId: String(doc._id) })
    if (sessionId) {
        const removed = await deleteWorkbenchSession(String(doc._id), sessionId).catch(() => false)
        if (removed) publishWorkbenchEvent(String(doc._id), { type: "notice", level: "info", message: "Sessão do OpenCode excluída" })
        else publishWorkbenchEvent(String(doc._id), { type: "notice", level: "info", message: "A sessão do OpenCode será excluída assim que o serviço estiver disponível" })
    }
    pumpQueue(doc.centralId)
}

// ---------------------------------------------------------------------------
// Ações da tela
// ---------------------------------------------------------------------------

/** A tarefa inteira (sem cortes) entregue ao planejador da mesa. */
function taskMarkdown(task: TaskDetailDto, config: CentralConfig): string {
    return buildUnderstandTaskPrompt(task, { ...config.include, timeLogs: false }, { fullText: true })
}

/** Efeitos na tarefa ao abrir a mesa (melhor esforço: falha vira aviso na mesa). */
async function applyStartEffects(id: string, task: TaskDetailDto, config: CentralConfig): Promise<void> {
    const notice = (level: "info" | "warn", message: string) => publishWorkbenchEvent(id, { type: "notice", level, message })
    const target = config.columns.onStart
    if (target && target !== task.columnId) {
        try {
            await moveTask(task.id, { targetColumn: target }, actorId())
            notice("info", "Tarefa movida para a coluna de implementação")
        } catch (error) {
            notice("warn", `Não foi possível mover a tarefa: ${errorText(error)}`)
        }
    }
}

/** Efeitos na tarefa ao reabrir a mesa (melhor esforço: falha vira aviso na mesa). */
async function applyReopenEffects(id: string, loaded: Loaded): Promise<void> {
    const notice = (level: "info" | "warn", message: string) => publishWorkbenchEvent(id, { type: "notice", level, message })
    const task = await getTask(loaded.doc.taskId)
    const target = reopenTargetColumn(loaded.config, await entryColumnForProject(loaded.projectId))
    if (target && target !== task.columnId) {
        try {
            await moveTask(task.id, { targetColumn: target }, actorId())
            notice("info", "Tarefa movida para a coluna de desenvolvimento")
        } catch (error) {
            notice("warn", `Não foi possível mover a tarefa: ${errorText(error)}`)
        }
    }
}

/**
 * Inicia o turno de build de uma mesa que está aguardando a vez (`build_queued`): reserva a porta
 * da prévia e roda o turno `building`. Devolve `false` quando a mesa já não está mais na fila (o
 * motor da fila tenta a próxima).
 */
export async function startBuildTurn(id: string): Promise<boolean> {
    const loaded = await loadAll(id)
    if (asStage(loaded.doc.stage) !== "build_queued") return false
    const port = await allocatePreviewPort(id, loaded.config.environment.previewHost, { min: loaded.config.environment.previewPortMin, max: loaded.config.environment.previewPortMax })
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "notice", level: "info", message: `Porta reservada para a prévia: ${port}` })
    await launchTurn(loaded, { stage: "building", text: buildPrompt(loaded.config, contextOf(loaded), port) }, { extraSet: { buildQueuedAt: null } })
    return true
}

export async function startWorkbench(centralId: string, taskId: string, text?: string): Promise<WorkbenchDto> {
    const { doc: central, config } = await loadCentral(centralId)
    await dbConnect()
    const existing = await AgenticWorkbench.findOne({ taskId }).lean()
    if (existing) throw new DomainError(409, "Esta tarefa já tem uma mesa de trabalho", "WORKBENCH_EXISTS", { workbenchId: String(existing._id) })
    const task = await getTask(taskId)
    if (task.project?.id !== central.projectId) throw new DomainError(400, `A tarefa ${task.code} não é do projeto ${central.projectName}`, "TASK_OTHER_PROJECT")
    await assertAvailable(centralId, null, config)

    let doc: IAgenticWorkbench
    try {
        doc = (
            await AgenticWorkbench.create({
                centralId,
                taskId,
                taskCode: task.code,
                taskTitle: task.title,
                stage: "planning",
                runState: "idle",
                composeProject: composeProjectFor(central.projectName, task.code),
                agenticFlow: task.agenticFlow,
            })
        ).toObject()
    } catch (error) {
        if ((error as { code?: number }).code === 11000) throw new DomainError(409, "Esta tarefa já tem uma mesa de trabalho", "WORKBENCH_EXISTS")
        throw error
    }
    const id = String(doc._id)
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.CRIAR, depois: { tarefa: task.code, central: central.projectName } })
    centralLogger(centralId, task.code).info("Mesa de trabalho aberta", { workbenchId: id })
    await prepareHub(id)
    await applyStartEffects(id, task, config)
    const loaded: Loaded = { doc, config, projectName: central.projectName, projectId: central.projectId, repo: await repoForProject(central.projectId) }
    // Informações adicionais digitadas na abertura vão no primeiro prompt (junto da tarefa).
    const additionalInfo = text?.trim() || null
    await launchTurn(
        loaded,
        { stage: "planning", text: planPrompt(config, contextOf(loaded), taskMarkdown(task, config), additionalInfo) },
        { ...(additionalInfo ? { userText: additionalInfo } : {}) },
    )
    return getWorkbench(id)
}

export async function revisePlan(id: string, feedback: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "revise-plan")
    await launchTurn(loaded, { stage: "planning", text: revisePlanPrompt(loaded.config, feedback) }, { userText: feedback, feedback })
    return getWorkbench(id)
}

export async function implement(id: string, additionalInfo?: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "implement")
    const ctx = contextOf(loaded)
    // Informações adicionais digitadas ao aprovar o plano vão no prompt de implementação.
    const info = additionalInfo?.trim() || null
    const userText = info ? `Plano aprovado: implementar\n\n${info}` : "Plano aprovado: implementar"
    await launchTurn(
        loaded,
        { stage: "implementing", text: implementPrompt(loaded.config, ctx, loaded.doc.plans?.length ?? 1, info) },
        { userText, extraSet: { branch: ctx.branch, worktreePath: ctx.worktreePath, composeProject: ctx.composeProject } },
    )
    return getWorkbench(id)
}

/** Correção pedida na prévia (ou após falha na implementação/build): volta ao planejamento. */
export async function requestCorrection(id: string, feedback: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "request-correction")
    await launchTurn(loaded, { stage: "planning", text: previewCorrectionPrompt(loaded.config, feedback) }, { userText: feedback, feedback })
    return getWorkbench(id)
}

export async function approve(id: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "approve")
    const task = await getTask(loaded.doc.taskId)
    const pr = loaded.doc.pr && loaded.doc.pr.state === "open" ? { number: loaded.doc.pr.number, url: loaded.doc.pr.url } : null
    await launchTurn(loaded, { stage: "opening_pr", text: prPrompt(loaded.config, contextOf(loaded), { code: task.code, title: task.title }, pr) }, { userText: "Prévia aprovada: abrir o Pull Request" })
    return getWorkbench(id)
}

export async function submitPrFeedback(id: string, feedback: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "submit-pr-feedback")
    await launchTurn(loaded, { stage: "planning", text: prChangesPrompt(loaded.config, loaded.doc.pr?.url ?? "PR", feedback) }, { userText: feedback, feedback })
    return getWorkbench(id)
}

export async function reopen(id: string, feedback: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "reopen")
    const pastPr = loaded.doc.pr ? { $push: { pastPrs: loaded.doc.pr } } : {}
    await AgenticWorkbench.updateOne({ _id: loaded.doc._id }, { $set: { pr: null, completedAt: null }, ...pastPr })
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: loaded.doc.taskCode, reaberta: true } })
    await applyReopenEffects(id, loaded)
    await launchTurn({ ...loaded, doc: { ...loaded.doc, pr: null } }, { stage: "planning", text: reopenPrompt(loaded.config, contextOf(loaded), feedback, loaded.doc.plans?.at(-1)?.text ?? null) }, { userText: `Mesa reaberta: ${feedback}`, feedback })
    return getWorkbench(id)
}

export async function reconnect(id: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    const doc = await reconcile(loaded.doc)
    // Já há um turno vivo neste processo acompanhando a mesa: nada a reconectar.
    if (isWorkbenchActive(id)) return getWorkbench(id)
    assertAction(doc, "reconnect")
    const stage = asStage(doc.stage)
    if (!doc.sessionId) throw new DomainError(409, "Esta mesa não tem uma sessão do OpenCode para reconectar (use Tentar novamente)", "WORKBENCH_NO_SESSION")
    if (!RUNNING_STAGES.includes(stage)) throw new DomainError(409, "A mesa não está numa etapa de execução para reconectar", "WORKBENCH_INVALID_STATE")
    await assertAgenticReady(loaded.config)
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "notice", level: "info", message: "Reconectando à sessão do OpenCode sem reenviar a mensagem…" })
    centralLogger(doc.centralId, doc.taskCode).info("Reconectando à sessão do OpenCode", { workbenchId: id, stage })
    await launchTurn({ ...loaded, doc }, { stage, text: "", attach: true })
    return getWorkbench(id)
}

export async function retry(id: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    const doc = await reconcile(loaded.doc)
    assertAction(doc, "retry")
    const stage = asStage(doc.stage)
    if (!RUNNING_STAGES.includes(stage) || !doc.lastPrompt) throw new DomainError(409, "Não há etapa para tentar de novo", "WORKBENCH_INVALID_STATE")
    if (stage === "finishing") {
        // Limpeza falhou: refaz só a limpeza (o PR já foi mergeado e a tarefa movida).
        await launchTurn({ ...loaded, doc }, { stage, text: cleanupPrompt(loaded.config, contextOf(loaded), { preview: Boolean(doc.previewUrl) }) }, { userText: "Tentar a limpeza novamente" })
        return getWorkbench(id)
    }
    if (stage === "building") {
        // O build não corre solto: volta para a fila global e o motor decide a vez (um build por vez).
        await update(doc, { stage: "build_queued", runState: "idle", error: null, buildQueuedAt: new Date() })
        pumpBuildQueue()
        return getWorkbench(id)
    }
    const text = `A execução anterior desta etapa não terminou (${doc.error ?? "motivo desconhecido"}). Retome de onde parou e conclua a etapa conforme as instruções abaixo.\n\n${doc.lastPrompt.text}`
    await launchTurn({ ...loaded, doc }, { stage, text }, { userText: "Tentar novamente" })
    return getWorkbench(id)
}

export async function interrupt(id: string): Promise<WorkbenchDto> {
    const doc = await loadWorkbench(id)
    if (!isWorkbenchActive(id)) {
        await reconcile(doc)
        return getWorkbench(id)
    }
    if (doc.sessionId) {
        const client = await getOpencodeClient()
        await client.session.interrupt({ sessionID: doc.sessionId }).catch(() => undefined)
    }
    abortWorkbenchRun(id, "Interrompido pelo usuário")
    centralLogger(doc.centralId, doc.taskCode).warn("Execução interrompida pelo usuário", { workbenchId: id })
    return getWorkbench(id)
}

export async function replyPermission(id: string, requestId: string, input: PermissionReplyInput): Promise<WorkbenchDto> {
    const doc = await loadWorkbench(id)
    if (!doc.sessionId || !(doc.pendingPermissions as { id?: string }[]).some((item) => item.id === requestId)) throw new DomainError(404, "Pedido de permissão não encontrado (já respondido?)", "PERMISSION_NOT_FOUND")
    const client = await getOpencodeClient()
    await client.permission.reply({ sessionID: doc.sessionId, requestID: requestId, decision: input.decision, ...(input.message ? { message: input.message } : {}) })
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "permission-replied", id: requestId, decision: input.decision })
    await update(doc, {}, { $pull: { pendingPermissions: { id: requestId } } })
    return getWorkbench(id)
}

export async function replyForm(id: string, formId: string, input: FormReplyInput): Promise<WorkbenchDto> {
    const doc = await loadWorkbench(id)
    if (!doc.sessionId || !(doc.pendingForms as { id?: string }[]).some((item) => item.id === formId)) throw new DomainError(404, "Pergunta não encontrada (já respondida?)", "FORM_NOT_FOUND")
    const client = await getOpencodeClient()
    if (input.cancel) await client.session.form.cancel({ sessionID: doc.sessionId, formID: formId })
    else await client.session.form.reply({ sessionID: doc.sessionId, formID: formId, answer: input.answer ?? {} })
    await prepareHub(id)
    if (input.answer && !input.cancel) {
        const summary = Object.values(input.answer)
            .map((value) => (Array.isArray(value) ? value.join(", ") : String(value)))
            .join(" · ")
        if (summary) publishWorkbenchEvent(id, { type: "user", text: summary })
    }
    publishWorkbenchEvent(id, { type: "form-closed", id: formId })
    await update(doc, {}, { $pull: { pendingForms: { id: formId } } })
    return getWorkbench(id)
}

export async function deleteWorkbench(id: string): Promise<void> {
    const doc = await loadWorkbench(id)
    if (isWorkbenchActive(id)) {
        if (doc.sessionId) await (await getOpencodeClient()).session.interrupt({ sessionID: doc.sessionId }).catch(() => undefined)
        abortWorkbenchRun(id, "Mesa excluída")
    }
    // Não perde sessões já pendentes de exclusão: tenta apagá-las antes de remover a mesa.
    await flushPendingSessionDeletions(doc).catch(() => undefined)
    await dropWorkbenchEvents(id)
    await AgenticWorkbench.deleteOne({ _id: doc._id })
    await syncWorkbenchTimer(id)
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { tarefa: doc.taskCode, etapa: doc.stage } })
    centralLogger(doc.centralId, doc.taskCode).warn("Mesa de trabalho excluída", { workbenchId: id })
    await publishAgentic({ centralId: doc.centralId, workbenchId: id, taskId: doc.taskId })
    pumpQueue(doc.centralId)
    pumpBuildQueue()
}

// ---------------------------------------------------------------------------
// Acompanhamento do PR (rotina agendada)
// ---------------------------------------------------------------------------

/** Pedido de mudança no PR (comentário com `@opex` ou revisão): com o motivo, replaneja sozinho; sem, pede o texto ao usuário. */
export async function handlePrFeedback(id: string, feedback: string): Promise<void> {
    const loaded = await loadAll(id)
    await prepareHub(id)
    if (!feedback.trim()) {
        publishWorkbenchEvent(id, { type: "notice", level: "warn", message: "O PR pediu mudanças sem dizer o motivo: descreva o que precisa mudar" })
        await update(loaded.doc, { stage: "changes_requested", runState: "idle" })
        return
    }
    try {
        await launchTurn(loaded, { stage: "planning", text: prChangesPrompt(loaded.config, loaded.doc.pr?.url ?? "PR", feedback) }, { userText: `Pedido de mudança no PR:\n\n${feedback}`, feedback })
    } catch (error) {
        // Sem como replanejar agora (ex.: limite de mesas): guarda o pedido para o usuário reenviar.
        publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `O PR pediu mudanças, mas o replanejamento não pôde começar (${errorText(error)}). Pedido:\n\n${feedback}` })
        await update(loaded.doc, { stage: "changes_requested", runState: "idle" })
    }
}

/**
 * Conflito de merge no PR: aciona o agente para resolver sozinho (merge da branch de destino) e
 * atualizar o PR com push — sem nova aprovação do usuário. Grava os SHAs (base/head) tratados para
 * não repetir o mesmo conflito a cada varredura; falha ao iniciar mantém a mesa elegível à próxima.
 */
export async function handlePrConflict(id: string, info: { baseBranch: string; headBranch: string; baseSha: string; headSha: string }): Promise<boolean> {
    const loaded = await loadAll(id)
    const { doc, config } = loaded
    const pr = doc.pr
    // Só age na mesa aberta e ociosa do mesmo PR aberto (nunca em cima de outra execução em andamento).
    if (asStage(doc.stage) !== "pr_open" || !pr || pr.state !== "open") return false
    if (isWorkbenchActive(id) || asRunState(doc.runState) === "running") return false
    await prepareHub(id)
    const marked: IWorkbenchPr = { ...pr, conflictBaseSha: info.baseSha, conflictHeadSha: info.headSha }
    try {
        await launchTurn(
            { ...loaded, doc: { ...doc, pr: marked } },
            { stage: "resolving_conflicts", text: conflictPrompt(config, contextOf(loaded), { number: pr.number, url: pr.url, baseBranch: info.baseBranch, headBranch: info.headBranch }) },
            { userText: `Conflito de merge no PR #${pr.number}: resolvendo automaticamente contra ${info.baseBranch}.`, extraSet: { pr: marked } },
        )
        centralLogger(doc.centralId, doc.taskCode).warn(`PR #${pr.number}: conflito de merge — resolução automática iniciada`, { workbenchId: id })
        return true
    } catch (error) {
        // Sem como resolver agora (OpenCode indisponível, limite de mesas…): mantém elegível à próxima varredura.
        publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `O PR #${pr.number} está com conflito de merge, mas a resolução não pôde começar (${errorText(error)}).` })
        return false
    }
}

interface GithubPullMerge {
    merged: boolean
    merged_at: string | null
    merge_commit_sha: string | null
    head?: { ref: string } | null
}

/** Estado de merge do PR no GitHub (confirmação server-side do merge e da branch de origem). */
function fetchPullMerge(repo: string, number: number): Promise<GithubPullMerge> {
    return githubRequest<GithubPullMerge>(`/repos/${repo}/pulls/${number}`)
}

/**
 * Efeitos comuns depois do merge: grava o estado, avisa, move a tarefa para a coluna de conclusão
 * (fechando a issue pelo vínculo), audita e devolve o turno de LIMPEZA quando a central o exige.
 * `null` significa que a mesa pode ser concluída na hora.
 */
async function afterMerge(loaded: Loaded, pr: IWorkbenchPr): Promise<TurnPlan | null> {
    const { doc, config } = loaded
    const id = String(doc._id)
    const log = centralLogger(doc.centralId, doc.taskCode)
    const notice = (level: "info" | "warn" | "success", message: string) => publishWorkbenchEvent(id, { type: "notice", level, message })
    await update(doc, { pr })
    notice("success", `PR #${pr.number} mergeado`)

    const doneColumn = config.columns.onDone
    if (doneColumn) {
        try {
            await moveTask(doc.taskId, { targetColumn: doneColumn }, actorId())
            notice("info", "Tarefa movida para a coluna de conclusão")
        } catch (error) {
            notice("warn", `Não foi possível mover a tarefa: ${errorText(error)}`)
            log.warn("Falha ao mover a tarefa na conclusão", { workbenchId: id, error: errorText(error) })
        }
    }
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: doc.taskCode, prMergeado: pr.url } })

    const cleanup = config.cleanup
    if (cleanup.teardownEnvironment || cleanup.removeWorktree || cleanup.deleteBranch) {
        // Sem prévia (fluxo PR automático) não há ambiente a derrubar.
        return { stage: "finishing", text: cleanupPrompt(config, contextOf(loaded), { preview: Boolean(doc.previewUrl) }) }
    }
    return null
}

/** PR mergeado: tarefa para Validação, timer parado e limpeza (conforme a central). */
export async function handlePrMerged(id: string, merge: { mergedAt: Date; mergeCommitSha: string | null }): Promise<void> {
    const loaded = await loadAll(id)
    const { doc } = loaded
    await prepareHub(id)
    const pr: IWorkbenchPr = { ...doc.pr!, state: "merged", mergedAt: merge.mergedAt, mergeCommitSha: merge.mergeCommitSha }
    const next = await afterMerge(loaded, pr)
    if (next) {
        try {
            await launchTurn({ ...loaded, doc: { ...doc, pr } }, next)
            return
        } catch (error) {
            publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `Limpeza não iniciada: ${errorText(error)}` })
        }
    }
    await completeWorkbench({ ...doc, pr })
}

/**
 * Merge automático (OPE-50): com a opção ligada na central, aciona o agente para fazer o merge do
 * PR aberto e pronto (etapa `merging_pr`, agente da etapa Pull Request), sem nova aprovação. Falha
 * ao iniciar mantém a mesa elegível à próxima varredura.
 */
export async function handlePrAutoMerge(id: string, info: { baseBranch: string }): Promise<boolean> {
    const loaded = await loadAll(id)
    const { doc, config } = loaded
    const pr = doc.pr
    if (!config.git.autoMerge) return false
    // Só age na mesa aberta e ociosa acompanhando o PR (nunca em cima de outra execução em andamento).
    if (asStage(doc.stage) !== "pr_open" || !pr || pr.state !== "open") return false
    if (isWorkbenchActive(id) || asRunState(doc.runState) === "running") return false
    if (!doc.branch) return false
    await prepareHub(id)
    try {
        await launchTurn(
            { ...loaded, doc },
            { stage: "merging_pr", text: mergePrPrompt(config, contextOf(loaded), { number: pr.number, url: pr.url, baseBranch: info.baseBranch }) },
            { userText: `Merge automático habilitado na central: mergeando o PR #${pr.number}.` },
        )
        centralLogger(doc.centralId, doc.taskCode).info(`PR #${pr.number}: merge automático iniciado`, { workbenchId: id })
        return true
    } catch (error) {
        publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `O merge automático do PR #${pr.number} não pôde começar (${errorText(error)}).` })
        return false
    }
}

/** PR fechado sem merge: avisa uma vez (a mesa continua aberta para decidir o que fazer). */
export async function handlePrClosed(id: string): Promise<void> {
    const doc = await loadWorkbench(id)
    if (!doc.pr || doc.pr.closedNotified) return
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `O PR #${doc.pr.number} foi fechado sem merge. Reabra o PR no GitHub ou exclua a mesa.` })
    await update(doc, { pr: { ...doc.pr, state: "closed", closedNotified: true } })
}

export async function handlePrReopened(id: string): Promise<void> {
    const doc = await loadWorkbench(id)
    if (!doc.pr || doc.pr.state === "open") return
    await update(doc, { pr: { ...doc.pr, state: "open", closedNotified: false } })
}

/** Grava os cursores de acompanhamento do PR (maior id de revisão e de comentário já tratados). */
export async function savePrCursors(id: string, cursors: { lastReviewId: number; lastCommentId: number }): Promise<void> {
    await AgenticWorkbench.updateOne({ _id: id }, { $set: { "pr.lastReviewId": cursors.lastReviewId, "pr.lastCommentId": cursors.lastCommentId } })
}

