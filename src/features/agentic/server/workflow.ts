import { isValidObjectId } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AgenticWorkbench, type IAgenticWorkbench, type IWorkbenchPr } from "@/lib/db/models/Agentic"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { getLocalUser } from "@/lib/local-user"
import { buildUnderstandTaskPrompt } from "@/features/ai/understand-task"
import { getTask, moveTask } from "@/features/tasks/server/service"
import { listActiveTimers, startTimer, stopTimer } from "@/features/time/server/service"
import type { TaskDetailDto } from "@/features/tasks/types"
import { AGENTIC_AUDIT_WORKBENCH, RUNNING_STAGES, STAGE_ROLE, WORKBENCH_STAGE_LABELS, type WorkbenchStage } from "../constants"
import { canRun, resolveAgent, type WorkbenchAction } from "../logic"
import {
    branchNameFor,
    buildPrompt,
    cleanupPrompt,
    composeProjectFor,
    extractJsonBlock,
    extractPrUrl,
    implementPrompt,
    planPrompt,
    prChangesPrompt,
    previewCorrectionPrompt,
    prPrompt,
    reopenPrompt,
    revisePlanPrompt,
    worktreePathFor,
    type WorkbenchContext,
} from "../prompts"
import { buildResultSchema, prResultSchema, type CentralConfig, type FormReplyInput, type PermissionReplyInput } from "../schemas"
import type { WorkbenchDto, WorkbenchSummaryDto } from "../types"
import { loadCentral, publishAgentic, repoForProduct } from "./centrals"
import { asRunState, asStage, toWorkbenchDto, toWorkbenchSummary } from "./dto"
import { abortWorkbenchRun, clearWorkbenchActive, dropWorkbenchEvents, flushWorkbenchEvents, isWorkbenchActive, markWorkbenchActive, prepareHub, publishWorkbenchEvent } from "./hub"
import { centralLogger } from "./log"
import { allocatePreviewPort, releasePreviewPort, waitForPreview } from "./ports"
import { runAgentTurn, type TurnResult } from "./runner"
import { agenticAvailability, loadAgenticSettings } from "./settings"

/**
 * Fluxo da mesa de trabalho: planejar → (corrigir) → implementar → subir a prévia → (corrigir) →
 * abrir o PR → acompanhar → concluir. Cada etapa de execução é um turno do agente na MESMA sessão
 * do OpenCode, rodando em segundo plano no servidor (fechar a tela não para a IA).
 */

const TURN_TIMEOUT_MS = 3 * 60 * 60_000
const PLAN_STATUSES_BEFORE_DEV = ["backlog", "prioritized", "specification"]

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
    await publishAgentic({ centralId: doc.centralId, workbenchId: String(doc._id), taskId: doc.taskId })
}

/** Mesa "executando" sem turno vivo neste processo (o app reiniciou): vira interrompida. */
async function reconcile(doc: IAgenticWorkbench): Promise<IAgenticWorkbench> {
    const id = String(doc._id)
    if (doc.runState !== "running" || isWorkbenchActive(id)) return doc
    const error = "A execução foi perdida (o app reiniciou durante a etapa). Use Tentar novamente."
    await AgenticWorkbench.updateOne({ _id: doc._id, runState: "running" }, { $set: { runState: "interrupted", error, pendingPermissions: [], pendingForms: [] } })
    return { ...doc, runState: "interrupted", error, pendingPermissions: [], pendingForms: [] }
}

export async function getWorkbench(id: string): Promise<WorkbenchDto> {
    return toWorkbenchDto(await reconcile(await loadWorkbench(id)))
}

export async function getWorkbenchByTask(taskId: string): Promise<WorkbenchDto | null> {
    await dbConnect()
    const doc = await AgenticWorkbench.findOne({ taskId }).lean()
    return doc ? toWorkbenchDto(await reconcile(doc)) : null
}

export async function listCentralWorkbenches(centralId: string): Promise<WorkbenchSummaryDto[]> {
    await dbConnect()
    const docs = await AgenticWorkbench.find({ centralId }).select({ taskId: 1, taskCode: 1, taskTitle: 1, stage: 1, runState: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).lean()
    return docs.map((doc) => toWorkbenchSummary(doc.runState === "running" && !isWorkbenchActive(String(doc._id)) ? { ...doc, runState: "interrupted" } : doc))
}

interface Loaded {
    doc: IAgenticWorkbench
    config: CentralConfig
    productName: string
    repo: { repo: string; repoUrl: string } | null
}

async function loadAll(id: string): Promise<Loaded> {
    const doc = await loadWorkbench(id)
    const { doc: central, config } = await loadCentral(doc.centralId)
    return { doc, config, productName: central.productName, repo: await repoForProduct(central.productId) }
}

function contextOf({ doc, config, productName, repo }: Loaded): WorkbenchContext {
    return {
        code: doc.taskCode,
        title: doc.taskTitle,
        productName,
        repo: repo?.repo ?? null,
        sessionDirectory: config.sessionDirectory,
        worktreePath: doc.worktreePath ?? worktreePathFor(config, doc.taskCode),
        branch: doc.branch ?? branchNameFor(config, { code: doc.taskCode, title: doc.taskTitle }),
        composeProject: doc.composeProject ?? composeProjectFor(productName, doc.taskCode),
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
    const { settings } = await loadAgenticSettings()
    const availability = await agenticAvailability(settings)
    if (!availability.available) throw new DomainError(409, availability.reason ?? "Desenvolvimento agêntico indisponível", "AGENTIC_UNAVAILABLE")
    if (!config.enabled) throw new DomainError(409, "A central está desativada em Integrações › Provedores de IA", "CENTRAL_DISABLED")
    const running = await AgenticWorkbench.countDocuments({ centralId, runState: "running", ...(workbenchId ? { _id: { $ne: workbenchId } } : {}) })
    if (running >= config.maxConcurrent) throw new DomainError(409, `Limite de ${config.maxConcurrent} mesa(s) executando ao mesmo tempo nesta central`, "CENTRAL_BUSY")
}

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------

interface TurnPlan {
    stage: WorkbenchStage
    text: string
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
    await assertAvailable(loaded.doc.centralId, id, loaded.config)
    await prepareHub(id)
    if (options.userText) publishWorkbenchEvent(id, { type: "user", text: options.userText })
    await update(loaded.doc, {
        stage: turn.stage,
        runState: "running",
        error: null,
        lastStage: turn.stage,
        lastPrompt: turn,
        heartbeatAt: new Date(),
        ...(options.feedback !== undefined ? { pendingFeedback: options.feedback } : {}),
        ...options.extraSet,
    })
    const controller = new AbortController()
    markWorkbenchActive(id, controller)
    void executeTurns(id, turn, controller)
        .catch((error) => centralLogger(loaded.doc.centralId, loaded.doc.taskCode).error("Falha inesperada na mesa", error))
        .finally(() => clearWorkbenchActive(id, controller))
}

/** Executa o turno e os encadeados (implementação → build), mantendo a mesa ativa entre eles. */
async function executeTurns(id: string, first: TurnPlan, controller: AbortController): Promise<void> {
    let turn: TurnPlan | null = first
    while (turn) {
        const loaded = await loadAll(id)
        const log = centralLogger(loaded.doc.centralId, loaded.doc.taskCode)
        if (turn !== first) await update(loaded.doc, { stage: turn.stage, runState: "running", error: null, lastStage: turn.stage, lastPrompt: turn, heartbeatAt: new Date() })
        let next: TurnPlan | null = null
        try {
            const client = await getOpencodeClient()
            const sessionId = await ensureSession(client, loaded)
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
            await AgenticWorkbench.updateOne(filter, { $push: { pendingPermissions: permission } })
            await changed()
        },
        onPermissionClosed: async (requestId: string) => {
            await AgenticWorkbench.updateOne(filter, { $pull: { pendingPermissions: { id: requestId } } })
            await changed()
        },
        onForm: async (form: unknown) => {
            await AgenticWorkbench.updateOne(filter, { $push: { pendingForms: form } })
            await changed()
        },
        onFormClosed: async (formId: string) => {
            await AgenticWorkbench.updateOne(filter, { $pull: { pendingForms: { id: formId } } })
            await changed()
        },
        onStep: async ({ costUsd, tokens }: { costUsd: number; tokens: { input: number; output: number; reasoning: number } }) => {
            await AgenticWorkbench.updateOne(filter, { $inc: { "usage.costUsd": costUsd, "usage.inputTokens": tokens.input, "usage.outputTokens": tokens.output, "usage.reasoningTokens": tokens.reasoning } })
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
            const port = await allocatePreviewPort(id, config.environment.previewHost)
            notice("info", `Porta reservada para a prévia: ${port}`)
            return { stage: "building", text: buildPrompt(config, ctx, port) }
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
            const pr: IWorkbenchPr = keep ? { ...doc.pr!, url: found.url, state: "open" } : { number: found.number, url: found.url, state: "open", mergedAt: null, mergeCommitSha: null, lastReviewId: 0, closedNotified: false }
            notice("success", keep ? `PR #${pr.number} atualizado` : `PR #${pr.number} aberto: ${pr.url}`)
            await update(doc, { stage: "pr_open", runState: "idle", pr })
            await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: doc.taskCode, pr: pr.url } })
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
    await update(doc, { stage: "done", runState: "idle", completedAt: new Date(), error: null, previewUrl: null, previewHealthy: null })
    publishWorkbenchEvent(String(doc._id), { type: "notice", level: "success", message: "Mesa de trabalho concluída" })
    centralLogger(doc.centralId, doc.taskCode).success("Mesa concluída", { workbenchId: String(doc._id) })
}

// ---------------------------------------------------------------------------
// Ações da tela
// ---------------------------------------------------------------------------

function taskMarkdown(task: TaskDetailDto, config: CentralConfig): string {
    return buildUnderstandTaskPrompt(task, { ...config.include, timeLogs: false }) + `\n\nLink da tarefa: ${task.platformUrl}`
}

/** Efeitos no Go! Sipal ao abrir a mesa (melhor esforço: falha vira aviso na mesa). */
async function goSipalOnStart(id: string, task: TaskDetailDto, config: CentralConfig): Promise<void> {
    const notice = (level: "info" | "warn", message: string) => publishWorkbenchEvent(id, { type: "notice", level, message })
    if (config.goSipal.moveToDevelopment && PLAN_STATUSES_BEFORE_DEV.includes(task.status)) {
        try {
            await moveTask(task.id, { targetStatus: "development", fromStatus: task.status, code: task.code }, actorId())
            notice("info", "Tarefa movida para Desenvolvimento no Go! Sipal")
        } catch (error) {
            notice("warn", `Não foi possível mover a tarefa para Desenvolvimento: ${errorText(error)}`)
        }
    }
    if (config.goSipal.startTimer) {
        try {
            const timers = await listActiveTimers()
            if (!timers.some((timer) => timer.taskId === task.id)) {
                await startTimer({ taskId: task.id }, actorId())
                notice("info", "Timer iniciado no Go! Sipal")
            }
        } catch (error) {
            notice("warn", `Não foi possível iniciar o timer: ${errorText(error)}`)
        }
    }
}

export async function startWorkbench(centralId: string, taskId: string): Promise<WorkbenchDto> {
    const { doc: central, config } = await loadCentral(centralId)
    await dbConnect()
    const existing = await AgenticWorkbench.findOne({ taskId }).lean()
    if (existing) throw new DomainError(409, "Esta tarefa já tem uma mesa de trabalho", "WORKBENCH_EXISTS", { workbenchId: String(existing._id) })
    const task = await getTask(taskId)
    if (task.product?.id !== central.productId) throw new DomainError(400, `A tarefa ${task.code} não é do produto ${central.productName}`, "TASK_OTHER_PRODUCT")
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
                composeProject: composeProjectFor(central.productName, task.code),
            })
        ).toObject()
    } catch (error) {
        if ((error as { code?: number }).code === 11000) throw new DomainError(409, "Esta tarefa já tem uma mesa de trabalho", "WORKBENCH_EXISTS")
        throw error
    }
    const id = String(doc._id)
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.CRIAR, depois: { tarefa: task.code, central: central.productName } })
    centralLogger(centralId, task.code).info("Mesa de trabalho aberta", { workbenchId: id })
    await prepareHub(id)
    await goSipalOnStart(id, task, config)
    const loaded: Loaded = { doc, config, productName: central.productName, repo: await repoForProduct(central.productId) }
    await launchTurn(loaded, { stage: "planning", text: planPrompt(config, contextOf(loaded), taskMarkdown(task, config)) })
    return getWorkbench(id)
}

export async function revisePlan(id: string, feedback: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "revise-plan")
    await launchTurn(loaded, { stage: "planning", text: revisePlanPrompt(loaded.config, feedback) }, { userText: feedback, feedback })
    return getWorkbench(id)
}

export async function implement(id: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "implement")
    const ctx = contextOf(loaded)
    await launchTurn(
        loaded,
        { stage: "implementing", text: implementPrompt(loaded.config, ctx, loaded.doc.plans?.length ?? 1) },
        { userText: "Plano aprovado: implementar", extraSet: { branch: ctx.branch, worktreePath: ctx.worktreePath, composeProject: ctx.composeProject } },
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
    await launchTurn(loaded, { stage: "opening_pr", text: prPrompt(loaded.config, contextOf(loaded), { code: task.code, title: task.title, url: task.platformUrl }, pr) }, { userText: "Prévia aprovada: abrir o Pull Request" })
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
    await launchTurn({ ...loaded, doc: { ...loaded.doc, pr: null } }, { stage: "planning", text: reopenPrompt(loaded.config, contextOf(loaded), feedback) }, { userText: `Mesa reaberta: ${feedback}`, feedback })
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
        await launchTurn({ ...loaded, doc }, { stage, text: cleanupPrompt(loaded.config, contextOf(loaded)) }, { userText: "Tentar a limpeza novamente" })
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
    await dropWorkbenchEvents(id)
    await AgenticWorkbench.deleteOne({ _id: doc._id })
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { tarefa: doc.taskCode, etapa: doc.stage } })
    centralLogger(doc.centralId, doc.taskCode).warn("Mesa de trabalho excluída", { workbenchId: id })
    await publishAgentic({ centralId: doc.centralId, workbenchId: id, taskId: doc.taskId })
}

// ---------------------------------------------------------------------------
// Acompanhamento do PR (rotina agendada)
// ---------------------------------------------------------------------------

/** Revisão pediu mudanças: com o motivo, replaneja sozinho; sem, pede o texto ao usuário. */
export async function handlePrChangesRequested(id: string, feedback: string): Promise<void> {
    const loaded = await loadAll(id)
    await prepareHub(id)
    if (!feedback.trim()) {
        publishWorkbenchEvent(id, { type: "notice", level: "warn", message: "A revisão do PR pediu mudanças sem dizer o motivo: descreva o que precisa mudar" })
        await update(loaded.doc, { stage: "changes_requested", runState: "idle" })
        return
    }
    try {
        await launchTurn(loaded, { stage: "planning", text: prChangesPrompt(loaded.config, loaded.doc.pr?.url ?? "PR", feedback) }, { userText: `Revisão do PR pediu mudanças:\n\n${feedback}`, feedback })
    } catch (error) {
        // Sem como replanejar agora (ex.: limite de mesas): guarda o pedido para o usuário reenviar.
        publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `A revisão do PR pediu mudanças, mas o replanejamento não pôde começar (${errorText(error)}). Pedido da revisão:\n\n${feedback}` })
        await update(loaded.doc, { stage: "changes_requested", runState: "idle" })
    }
}

/** PR mergeado: tarefa para Validação, timer parado e limpeza (conforme a central). */
export async function handlePrMerged(id: string, merge: { mergedAt: Date; mergeCommitSha: string | null }): Promise<void> {
    const loaded = await loadAll(id)
    const { doc, config, repo } = loaded
    const log = centralLogger(doc.centralId, doc.taskCode)
    await prepareHub(id)
    const notice = (level: "info" | "warn" | "success", message: string) => publishWorkbenchEvent(id, { type: "notice", level, message })
    const pr = { ...doc.pr!, state: "merged" as const, mergedAt: merge.mergedAt, mergeCommitSha: merge.mergeCommitSha }
    await update(doc, { pr })
    notice("success", `PR #${pr.number} mergeado`)

    const commitUrl = merge.mergeCommitSha && repo ? `${repo.repoUrl.replace(/\/+$/, "")}/commit/${merge.mergeCommitSha}` : undefined
    try {
        await moveTask(doc.taskId, { targetStatus: "validation", code: doc.taskCode, ...(commitUrl ? { commitUrl } : {}), pullRequestUrl: pr.url }, actorId())
        notice("info", "Tarefa movida para Validação no Go! Sipal")
    } catch (error) {
        notice("warn", `Não foi possível mover a tarefa para Validação: ${errorText(error)}`)
        log.warn("Falha ao mover a tarefa para Validação", { workbenchId: id, error: errorText(error) })
    }
    if (config.goSipal.stopTimerOnDone) {
        try {
            const timers = (await listActiveTimers()).filter((timer) => timer.taskId === doc.taskId)
            for (const timer of timers) await stopTimer(timer.id, { description: `Desenvolvimento agêntico: PR #${pr.number} mergeado`, taskCode: doc.taskCode }, actorId())
            if (timers.length) notice("info", "Timer parado no Go! Sipal")
        } catch (error) {
            notice("warn", `Não foi possível parar o timer: ${errorText(error)}`)
        }
    }
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: doc.taskCode, prMergeado: pr.url } })

    const cleanup = config.cleanup
    if (cleanup.teardownEnvironment || cleanup.removeWorktree || cleanup.deleteBranch) {
        try {
            await launchTurn({ ...loaded, doc: { ...doc, pr } }, { stage: "finishing", text: cleanupPrompt(config, contextOf(loaded)) })
            return
        } catch (error) {
            notice("warn", `Limpeza não iniciada: ${errorText(error)}`)
        }
    }
    await completeWorkbench({ ...doc, pr })
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

export async function saveLastReviewId(id: string, lastReviewId: number): Promise<void> {
    await AgenticWorkbench.updateOne({ _id: id }, { $set: { "pr.lastReviewId": lastReviewId } })
}

