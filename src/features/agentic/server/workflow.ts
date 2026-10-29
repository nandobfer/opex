import { isValidObjectId } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AgenticWorkbench, type IAgenticWorkbench, type IPendingTurn, type IWorkbenchPr } from "@/lib/db/models/Agentic"
import { getOpencodeClient, runOpencodeShell, type OpencodeClient } from "@/lib/ai/opencode-client"
import { getLocalUser } from "@/lib/local-user"
import { buildUnderstandTaskPrompt } from "@/features/ai/understand-task"
import { getTask, moveTask } from "@/features/tasks/server/service"
import { githubRequest } from "@/features/github/client"
import { accumulateWorkPeriodUsage } from "@/features/time/server/service"
import type { TaskDetailDto } from "@/features/tasks/types"
import { AGENT_ROLE_LABELS, AGENTIC_AUDIT_WORKBENCH, PENDING_TURN_LABELS, RUNNING_STAGES, STAGE_ROLE, WORKBENCH_MODEL_ROLE_LABELS, WORKBENCH_STAGE_LABELS, type PendingTurnAction, type WorkbenchStage } from "../constants"
import { asAgenticFlow, canRun, manualStageBlock, reopenTargetColumn, inheritsGlobalPorts, resolveAgent, resolveCentralCi, resolveCentralColumns, resolveCentralFlow, resolveCentralPorts, type WorkbenchAction } from "../logic"
import {
    branchNameFor,
    buildFixPrompt,
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
    ciFixPrompt,
    previewBuildCommands,
    previewPreparePrompt,
    remotePreviewCommands,
    type PreviewDocker,
    type WorkbenchContext,
} from "../prompts"
import type { CiFailure } from "../ci"
import { buildResultSchema, ciFixResultSchema, conflictResultSchema, prResultSchema, type AgenticCi, type AgenticColumns, type CentralConfig, type FormReplyInput, type PermissionReplyInput, type SetWorkbenchStageInput, type WorkbenchModelInput, type WorkbenchPreviewInput } from "../schemas"
import type { WorkbenchDto, WorkbenchSummaryDto } from "../types"
import { logger } from "@/lib/logger"
import { newJobId } from "@/features/local-docker/server/detached"
import { buildExitLine, buildFixSeparator, buildPrepareSeparator, terminalBuildFailure } from "../build-log"
import { appendBuildOutput, beginBuildSection, dropBuilds, restartBuildSection, resumeBuild, settleBuild, startBuild } from "./build-logs"
import { runPreviewBuild } from "./preview-build"
import { buildQueuePosition, buildQueuePositions, pumpBuildQueue } from "./build-queue"
import { cleanupTargets, cleanupVerificationCommands, deletionContext, hasCleanupWork, type CleanupTargets } from "./environment-cleanup"
import { entryColumnForProject, loadCentral, publishAgentic, repoForProject } from "./centrals"
import { asRunState, asStage, toWorkbenchDto, toWorkbenchSummary } from "./dto"
import { probeReconnect } from "./reconnect"
import { abortWorkbenchRun, clearWorkbenchActive, dropWorkbenchEvents, flushWorkbenchEvents, isWorkbenchActive, markWorkbenchActive, prepareHub, publishWorkbenchEvent } from "./hub"
import { liveChatEnabled, deliverLiveMessage } from "./live-chat"
import { claimAgenticFiles, deleteWorkbenchFiles, fileDtosFor, fileIdsOf, liveAttachments, loadClaimableFiles, promptFilesFor } from "./files"
import { agenticDownloadDir, withAttachmentsSection } from "../files"
import { centralLogger } from "./log"
import { allocatePreviewPort, releasePreviewPort, waitForPreview } from "./ports"
import { assertPreviewBackup, assertPreviewBackupRemoved, reservePreviewBackup } from "./preview-backup"
import { runAgentTurn, type TurnResult } from "./runner"
import { deleteWorkbenchSession, flushPendingSessionDeletions } from "./session-cleanup"
import { applyForkNotes, withUnsyncedForkNotes } from "./fork-notes"
import { describeModel, toModelChoice, validatedModelOverride, workbenchModels, workbenchOverrides, workbenchTurnAgent } from "./models"
import { agenticAvailability, loadAgenticSettings } from "./settings"
import { fallbackNotice, runWithFallback } from "./model-fallback"
import { syncWorkbenchTimer } from "./timer-sync"
import { needsSlotToRun, occupiedSlots, runInCentral, slotQueuePosition, slotQueuePositions } from "./slots"
import { reserveRemotePreview, invalidateRemotePreview, assertRemotePreview } from "./remote-preview"

/**
 * Fluxo da mesa de trabalho: planejar → (corrigir) → implementar → subir a prévia → (corrigir) →
 * abrir o PR → acompanhar → concluir. Cada etapa de execução é um turno do agente na MESMA sessão
 * do OpenCode, rodando em segundo plano no servidor (fechar a tela não para a IA).
 */

const TURN_TIMEOUT_MS = 3 * 60 * 60_000
/** O script da prévia no GitHub Action espera testes + build do workflow: nunca menos que isto. */
const REMOTE_BUILD_MIN_MINUTES = 25

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
    const adversarial = asStage(doc.stage) === "adversarial_review"
    const error = adversarial
        ? "A revisão adversária foi perdida neste app (o app reiniciou durante a rodada). Tente novamente ou siga mesmo assim."
        : "A execução foi perdida neste app (o app reiniciou durante a etapa). Tente novamente ou reconecte se o agente ainda estiver rodando."
    // A rodada do adversário que estava "revisando" vira falha (o "Tentar novamente" repete a mesma rodada).
    if (adversarial) await (await adversaryModule()).failOrphanReviews(id, error).catch(() => undefined)
    await AgenticWorkbench.updateOne({ _id: doc._id, runState: "running" }, { $set: { runState: "interrupted", error, pendingPermissions: [], pendingForms: [] } })
    await syncWorkbenchTimer(String(doc._id))
    return { ...doc, runState: "interrupted", error, pendingPermissions: [], pendingForms: [] }
}

export async function getWorkbench(id: string): Promise<WorkbenchDto> {
    const doc = await reconcile(await loadWorkbench(id))
    return toWorkbenchDto(doc, await buildQueuePosition(id), doc.pendingTurn ? await slotQueuePosition(id) : null, await workbenchModels(doc), await liveChatEnabled(doc.centralId), await (await adversaryModule()).adversaryApplies(doc.centralId))
}

export async function getWorkbenchByTask(taskId: string): Promise<WorkbenchDto | null> {
    await dbConnect()
    const doc = await AgenticWorkbench.findOne({ taskId }).lean()
    if (!doc) return null
    return toWorkbenchDto(await reconcile(doc), await buildQueuePosition(String(doc._id)), doc.pendingTurn ? await slotQueuePosition(String(doc._id)) : null, await workbenchModels(doc), await liveChatEnabled(doc.centralId), await (await adversaryModule()).adversaryApplies(doc.centralId))
}

export async function listCentralWorkbenches(centralId: string): Promise<WorkbenchSummaryDto[]> {
    await dbConnect()
    const [docs, positions, slots] = await Promise.all([
        AgenticWorkbench.find({ centralId }).select({ taskId: 1, taskCode: 1, taskTitle: 1, stage: 1, runState: 1, pendingPermissions: 1, pendingForms: 1, pendingTurn: 1, forksDonePrompt: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).lean(),
        buildQueuePositions(),
        slotQueuePositions(),
    ])
    return docs.map((doc) => {
        const reconciled = doc.runState === "running" && !isWorkbenchActive(String(doc._id)) ? { ...doc, runState: "interrupted" } : doc
        return toWorkbenchSummary(reconciled, positions.get(String(doc._id)) ?? null, slots.get(String(doc._id)) ?? null)
    })
}

interface Loaded {
    doc: IAgenticWorkbench
    config: CentralConfig
    /** Colunas efetivas da central (herdadas do padrão global ou personalizadas — OPE-79). */
    columns: AgenticColumns
    /** Correção de CI efetiva da central (herdada do padrão global ou personalizada — OPE-81). */
    ci: AgenticCi
    projectName: string
    projectId: string
    repo: { repo: string; repoUrl: string } | null
}

/** Faixa efetiva de portas: só lê a configuração geral quando a central herda a faixa padrão. */
async function effectivePorts(env: CentralConfig["environment"]): Promise<{ min: number; max: number }> {
    if (!inheritsGlobalPorts(env)) return resolveCentralPorts(undefined, env)
    const { settings } = await loadAgenticSettings()
    return resolveCentralPorts(settings.ports, env)
}

async function loadAll(id: string): Promise<Loaded> {
    const doc = await loadWorkbench(id)
    const { doc: central, config } = await loadCentral(doc.centralId)
    const { settings } = await loadAgenticSettings()
    return { doc, config, columns: resolveCentralColumns(settings.columns, config.columns), ci: resolveCentralCi(settings.ci, config.git), projectName: central.projectName, projectId: central.projectId, repo: await repoForProject(central.projectId) }
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
    // Exclusão em andamento: só retomar a limpeza (Tentar novamente) ou reconectar ao turno dela.
    if (doc.deletionRequestedAt && action !== "retry" && action !== "reconnect") {
        throw new DomainError(409, "A mesa está sendo excluída: a limpeza do ambiente precisa terminar antes de qualquer outra ação", "WORKBENCH_DELETING")
    }
    const stage = asStage(doc.stage)
    const runState = isWorkbenchActive(String(doc._id)) ? "running" : asRunState(doc.runState) === "running" ? "interrupted" : asRunState(doc.runState)
    const waitingSlot = Boolean(doc.pendingTurn)
    if (!canRun(stage, runState, action, waitingSlot)) {
        const detail = waitingSlot ? " (a mesa está aguardando vaga na central)" : runState === "running" ? " (o agente está trabalhando)" : ""
        throw new DomainError(409, `Ação indisponível na etapa "${WORKBENCH_STAGE_LABELS[stage]}"${detail}`, "WORKBENCH_INVALID_STATE")
    }
}

async function assertAvailable(centralId: string, workbenchId: string | null, config: CentralConfig): Promise<void> {
    await assertAgenticReady(config)
    // O limite conta as mesas que ocupam vaga (não concluídas e fora de Plano pronto/Prévia pronta/PR aberto);
    // a própria mesa não conta ao retomar um turno.
    const open = await occupiedSlots(centralId, workbenchId)
    if (open >= config.maxConcurrent) throw new DomainError(409, `Limite de ${config.maxConcurrent} mesa(s) ocupando vaga ao mesmo tempo nesta central`, "CENTRAL_BUSY")
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

/** Forks da conversa (import dinâmico: `forks.ts` usa as ações deste módulo para integrar). */
const forksModule = () => import("./forks")

/** Agente Adversário (import dinâmico: só carrega quando a mesa chega ao fim da implementação; uma vez por processo). */
let adversaryImport: Promise<typeof import("@/features/adversarial-agent/server/workflow-hook")> | null = null
const adversaryModule = () => (adversaryImport ??= import("@/features/adversarial-agent/server/workflow-hook"))

/** Builder Machine (import dinâmico, uma vez por processo): só com a integração ativa. Ver aicontext/modules/builder-machine.md. */
let localDockerImport: Promise<typeof import("@/features/local-docker/server/agentic-hooks")> | null = null
async function localDockerHooks() {
    const { isBuilderMachineActive } = await import("@/features/local-docker/server/active")
    if (!(await isBuilderMachineActive())) return null
    return (localDockerImport ??= import("@/features/local-docker/server/agentic-hooks"))
}

// ---------------------------------------------------------------------------
// Espera por vaga (retomadas de mesas que não ocupam vaga)
// ---------------------------------------------------------------------------

/**
 * Executa o turno de uma ação. Se a mesa não ocupa vaga (Plano pronto, Prévia pronta, PR aberto ou
 * concluída) e a central está no limite — ou há retomadas esperando antes dela —, grava a ação em
 * `pendingTurn` e a mesa **aguarda vaga** (o motor da central a lança depois). Devolve `true` quando
 * o turno começou e `false` quando ficou aguardando.
 */
async function launchOrQueue(loaded: Loaded, action: PendingTurnAction, turn: TurnPlan, options: LaunchOptions = {}, flags: { reopen?: boolean } = {}): Promise<boolean> {
    const { doc, config } = loaded
    const id = String(doc._id)
    const stage = asStage(doc.stage)
    if (!needsSlotToRun(stage)) {
        await launchTurn(loaded, turn, { ...options, action })
        return true
    }
    if (isWorkbenchActive(id)) throw new DomainError(409, "O agente já está trabalhando nesta mesa", "WORKBENCH_BUSY")
    // OpenCode/central indisponível continua sendo erro na hora (não é falta de vaga).
    await assertAgenticReady(config)
    return runInCentral(doc.centralId, async () => {
        const current = await loadWorkbench(id)
        if (current.deletionRequestedAt || current.pendingTurn || current.stage !== doc.stage || isWorkbenchActive(id)) {
            throw new DomainError(409, "A mesa mudou de estado; atualize antes de tentar novamente", "WORKBENCH_BUSY")
        }
        const [occupied, othersWaiting] = await Promise.all([occupiedSlots(doc.centralId, id), AgenticWorkbench.exists({ centralId: doc.centralId, pendingTurn: { $ne: null }, _id: { $ne: doc._id } })])
        if (!othersWaiting && occupied < config.maxConcurrent) {
            await launchTurn(flags.reopen ? await applyReopen(loaded) : loaded, turn, { ...options, action })
            return true
        }
        const pendingTurn: IPendingTurn = {
            action,
            stage: turn.stage,
            text: turn.text,
            userText: options.userText ?? null,
            feedback: options.feedback ?? null,
            extraSet: options.extraSet ?? null,
            reopen: Boolean(flags.reopen),
            fromStage: stage,
            queuedAt: new Date(),
            ...(turn.fileIds?.length ? { fileIds: turn.fileIds } : {}),
        }
        await update(doc, { pendingTurn })
        const position = await slotQueuePosition(id)
        await prepareHub(id)
        publishWorkbenchEvent(id, {
            type: "notice",
            level: "info",
            message: `Limite de ${config.maxConcurrent} mesa(s) ocupando vaga nesta central: "${PENDING_TURN_LABELS[action]}" aguarda vaga${position ? ` (posição #${position})` : ""} e começa sozinho quando liberar.`,
        })
        centralLogger(doc.centralId, doc.taskCode).info(`Aguardando vaga na central: ${PENDING_TURN_LABELS[action]}`, { workbenchId: id, position })
        return false
    })
}

/**
 * Lança a retomada que aguardava vaga (chamado pelo motor da central, dentro de `runInCentral`, já
 * com vaga). `dropped` quando a espera não vale mais (a mesa mudou de etapa ou já está executando).
 * Indisponibilidade (OpenCode, central desativada, limite) devolve a espera e lança o erro.
 */
export async function startPendingTurn(id: string): Promise<"started" | "dropped"> {
    const loaded = await loadAll(id)
    const { doc } = loaded
    const pending = doc.pendingTurn
    if (!pending) return "dropped"
    if (doc.deletionRequestedAt || asStage(doc.stage) !== pending.fromStage || isWorkbenchActive(id)) {
        await update(doc, { pendingTurn: null })
        centralLogger(doc.centralId, doc.taskCode).warn("Espera por vaga descartada: a mesa mudou de etapa", { workbenchId: id })
        return "dropped"
    }
    await assertAgenticReady(loaded.config)
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { pendingTurn: null } })
    let reopened = false
    try {
        // "Gerar a prévia" não é um turno do agente: com a vaga, a mesa entra no build da prévia.
        if (pending.action === "generate-preview") {
            await enterBuildQueue(loaded)
            centralLogger(doc.centralId, doc.taskCode).info("Vaga liberada: Gerar a prévia", { workbenchId: id })
            return "started"
        }
        const ready = pending.reopen ? await applyReopen(loaded) : loaded
        reopened = Boolean(pending.reopen)
        await launchTurn(
            ready,
            { stage: asStage(pending.stage), text: pending.text, ...(pending.fileIds?.length ? { fileIds: pending.fileIds } : {}) },
            {
                action: pending.action as PendingTurnAction,
                ...(pending.userText ? { userText: pending.userText } : {}),
                ...(pending.feedback !== null ? { feedback: pending.feedback } : {}),
                ...(pending.extraSet ? { extraSet: pending.extraSet } : {}),
            },
        )
    } catch (error) {
        // Mantém o lugar na fila (mesmo `queuedAt`) e a reabertura não repete os efeitos já aplicados.
        await AgenticWorkbench.updateOne({ _id: doc._id, pendingTurn: null }, { $set: { pendingTurn: { ...pending, reopen: pending.reopen && !reopened } } })
        throw error
    }
    centralLogger(doc.centralId, doc.taskCode).info(`Vaga liberada: ${PENDING_TURN_LABELS[pending.action as PendingTurnAction] ?? pending.action}`, { workbenchId: id })
    return "started"
}

/** Cancela a espera por vaga: a mesa volta a aguardar a ação do usuário na etapa em que estava. */
export async function cancelWait(id: string): Promise<WorkbenchDto> {
    const initial = await loadWorkbench(id)
    return runInCentral(initial.centralId, async () => {
        const doc = await loadWorkbench(id)
        assertAction(doc, "cancel-wait")
        const pending = doc.pendingTurn!
        await update(doc, { pendingTurn: null })
        const label = PENDING_TURN_LABELS[pending.action as PendingTurnAction] ?? pending.action
        await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { tarefa: doc.taskCode, aguardandoVaga: label }, depois: { tarefa: doc.taskCode, aguardandoVaga: null } })
        await prepareHub(id)
        publishWorkbenchEvent(id, { type: "notice", level: "info", message: `Espera por vaga cancelada ("${label}").` })
        centralLogger(doc.centralId, doc.taskCode).info("Espera por vaga cancelada pelo usuário", { workbenchId: id })
        // A próxima retomada da fila pode ter ganhado a vez.
        pumpQueue(doc.centralId)
        return getWorkbench(id)
    })
}

/**
 * Troca o modelo (e a variante) de um papel da conversa principal desta mesa; `model: null` volta ao
 * modelo do papel. Vale a partir do próximo turno desse papel (o turno em andamento não muda).
 */
export async function setWorkbenchModel(id: string, input: WorkbenchModelInput): Promise<WorkbenchDto> {
    const doc = await loadWorkbench(id)
    const title = WORKBENCH_MODEL_ROLE_LABELS[input.role]
    const roleLabel = AGENT_ROLE_LABELS[input.role].label
    const override = await validatedModelOverride(input, title)
    const [{ settings }, { config }] = await Promise.all([loadAgenticSettings(), loadCentral(doc.centralId)])
    const base = resolveAgent(settings, config, input.role)
    const current = workbenchOverrides(doc)
    const before = toModelChoice(base, current[input.role] ?? null)
    const after = toModelChoice(base, override)
    // Grava o objeto inteiro (o campo pode estar `null` em mesas antigas, o que impede `$set` no caminho).
    const overrides = { ...current }
    if (override) overrides[input.role] = override
    else delete overrides[input.role]
    await update(doc, { modelOverrides: overrides })
    await recordAudit({
        userId: actorId(),
        entidade: AGENTIC_AUDIT_WORKBENCH,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { tarefa: doc.taskCode, etapa: roleLabel, modelo: describeModel(before), trocado: before.overridden },
        depois: { tarefa: doc.taskCode, etapa: roleLabel, modelo: describeModel(after), trocado: after.overridden },
    })
    await prepareHub(id)
    publishWorkbenchEvent(id, {
        type: "notice",
        level: "info",
        message: override ? `${title} trocado para ${describeModel(after)}: vale a partir do próximo turno.` : `${title} voltou ao padrão (${describeModel(after)}): vale a partir do próximo turno.`,
    })
    centralLogger(doc.centralId, doc.taskCode).info(`${title}: ${describeModel(after)}${override ? " (trocado na mesa)" : " (padrão)"}`, { workbenchId: id })
    return getWorkbench(id)
}

/** A mesa está com "Gerar prévia" desligada (fluxo PR automático)? Lê do banco (a chave muda a qualquer momento). */
async function skipsPreview(id: string): Promise<boolean> {
    const fresh = await AgenticWorkbench.findById(id).select({ agenticFlow: 1 }).lean()
    return asAgenticFlow(fresh?.agenticFlow) === "auto_pr"
}

/** Turno que publica no PR sem prévia (abre o PR ou, se já existe, atualiza e comenta). */
function autoPrTurn(loaded: Loaded): TurnPlan {
    const { doc, config } = loaded
    const pr = doc.pr && doc.pr.state === "open" ? { number: doc.pr.number, url: doc.pr.url } : null
    return { stage: "opening_pr", text: prPrompt(config, contextOf(loaded), { code: doc.taskCode, title: doc.taskTitle }, pr, { fromPreview: false }) }
}

/**
 * Fim da implementação (ou da revisão adversária aprovada): fluxo PR automático encadeia a abertura
 * do PR na mesma sessão; prévia no GitHub encadeia o build remoto (sem fila local); senão a mesa entra
 * na fila global do build (a porta é reservada na vez dela). Relê o fluxo: a chave "Gerar prévia" pode
 * ter sido trocada durante a etapa.
 */
async function afterImplementation(loaded: Loaded): Promise<TurnPlan | null> {
    const { doc, config } = loaded
    const id = String(doc._id)
    const notice = (message: string) => publishWorkbenchEvent(id, { type: "notice", level: "info", message })
    if (await skipsPreview(id)) {
        notice("Geração de prévia desligada: pulando a prévia e publicando no Pull Request.")
        return autoPrTurn(loaded)
    }
    if (config.environment.previewMethod === "github") {
        notice("Implementação concluída. Iniciando testes e build no GitHub, sem fila local.")
        return prepareBuildTurn(loaded, "github")
    }
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { previewBuild: { method: "local" } } })
    await update(doc, { stage: "build_queued", runState: "idle", buildQueuedAt: new Date() })
    notice("Implementação concluída. Aguardando a vez do build — um build por vez.")
    return null
}

/**
 * Gera a prévia de uma mesa parada (sem ocupar vaga): entra no build agora ou, com a central no
 * limite (ou retomadas esperando antes), aguarda vaga com "Gerar a prévia". `true` = aguardando.
 */
async function enterBuildQueueOrWait(loaded: Loaded): Promise<boolean> {
    const { doc, config } = loaded
    const id = String(doc._id)
    await assertAgenticReady(config)
    return runInCentral(doc.centralId, async () => {
        const [occupied, othersWaiting] = await Promise.all([occupiedSlots(doc.centralId, id), AgenticWorkbench.exists({ centralId: doc.centralId, pendingTurn: { $ne: null }, _id: { $ne: doc._id } })])
        if (!othersWaiting && occupied < config.maxConcurrent) {
            await enterBuildQueue(loaded)
            return false
        }
        const pendingTurn: IPendingTurn = { action: "generate-preview", stage: "build_queued", text: "", userText: null, feedback: null, extraSet: null, reopen: false, fromStage: asStage(doc.stage), queuedAt: new Date() }
        await update(doc, { pendingTurn })
        return true
    })
}

/**
 * Gera a prévia do código atual: no modo local, a mesa entra na fila global do build; no modo GitHub,
 * o build remoto começa na hora (sem fila local).
 */
async function enterBuildQueue(loaded: Loaded): Promise<void> {
    const { doc, config } = loaded
    if (config.environment.previewMethod === "github") {
        await launchTurn(loaded, await prepareBuildTurn(loaded, "github"))
        return
    }
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { previewBuild: { method: "local" } } })
    await update(doc, { stage: "build_queued", runState: "idle", error: null, buildQueuedAt: new Date() })
    pumpBuildQueue()
}

/**
 * "Gerar nova prévia" (Prévia pronta): reconstrói a prévia com o código atual do worktree pelo fluxo
 * da mesa (fila global do build ou nova tentativa no GitHub Action, porta reservada, máquina da prévia
 * e teste de saúde), sem replanejar e sem nova rodada do Agente Adversário (o código não mudou).
 * `requestedBy` identifica quem pediu (ex.: "Fork 2") no aviso e na auditoria.
 */
export async function rebuildPreview(id: string, requestedBy: string | null = null): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    const { doc, config } = loaded
    assertAction(doc, "rebuild-preview")
    const waiting = await enterBuildQueueOrWait(loaded)
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: doc.taskCode, novaPrevia: true, ...(requestedBy ? { pedidoPor: requestedBy } : {}) } })
    await prepareHub(id)
    const who = requestedBy ? ` (pedido pelo ${requestedBy})` : ""
    if (waiting) {
        const position = await slotQueuePosition(id)
        publishWorkbenchEvent(id, { type: "notice", level: "info", message: `Nova prévia${who}: limite de ${config.maxConcurrent} mesa(s) ocupando vaga nesta central; "Gerar a prévia" aguarda vaga${position ? ` (posição #${position})` : ""}.` })
    } else {
        publishWorkbenchEvent(id, { type: "notice", level: "info", message: `Nova prévia${who}: reconstruindo com o código atual (${config.environment.previewMethod === "github" ? "build no GitHub" : "fila do build"}).` })
    }
    centralLogger(doc.centralId, doc.taskCode).info("Nova prévia solicitada", { workbenchId: id, requestedBy, waiting })
    return getWorkbench(id)
}

/**
 * Chave "Gerar prévia" desta mesa (troca o fluxo só da mesa; a tarefa mantém o fluxo salvo):
 * - desligar: ao fim da implementação pula a prévia e publica no PR; na fila do build, sai dela e já
 *   publica; com o build rodando, publica ao fim dele; em Prévia pronta, fica como está;
 * - religar: com a mesa parada em PR aberto, gera a prévia do código atual na hora (fila do build, ou
 *   aguarda vaga com "Gerar a prévia" se a central estiver no limite); nas outras etapas vale na
 *   próxima implementação.
 */
export async function setWorkbenchPreview(id: string, input: WorkbenchPreviewInput): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    const { doc, config } = loaded
    const stage = asStage(doc.stage)
    if (stage === "finishing" || stage === "done") throw new DomainError(409, "A mesa está concluída ou finalizando: não há prévia para gerar", "WORKBENCH_PREVIEW_LOCKED")
    if (doc.deletionRequestedAt) throw new DomainError(409, "A mesa está sendo excluída", "WORKBENCH_PREVIEW_LOCKED")
    const flow = input.enabled ? "preview" : "auto_pr"
    const before = asAgenticFlow(doc.agenticFlow)
    if (before === flow) return getWorkbench(id)
    await update(doc, { agenticFlow: flow })
    await recordAudit({
        userId: actorId(),
        entidade: AGENTIC_AUDIT_WORKBENCH,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { tarefa: doc.taskCode, gerarPrevia: before === "preview" },
        depois: { tarefa: doc.taskCode, gerarPrevia: input.enabled },
    })
    await prepareHub(id)
    const notice = (message: string) => publishWorkbenchEvent(id, { type: "notice", level: "info", message })
    const log = centralLogger(doc.centralId, doc.taskCode)
    const idle = doc.runState !== "running" && !isWorkbenchActive(id)
    const current: Loaded = { ...loaded, doc: Object.assign(doc, { agenticFlow: flow }) }

    if (!input.enabled) {
        if (stage === "build_queued" && idle) {
            notice("Geração de prévia desligada: a mesa saiu da fila do build e vai publicar no Pull Request.")
            await launchTurn(current, autoPrTurn(current), { extraSet: { buildQueuedAt: null } })
        } else if (stage === "building") {
            notice("Geração de prévia desligada: o build em andamento termina e a mesa publica no Pull Request sem parar na prévia.")
        } else if (stage === "preview") {
            notice("Geração de prévia desligada: esta prévia continua para você aprovar ou corrigir; vale a partir da próxima implementação.")
        } else {
            notice("Geração de prévia desligada: ao fim da implementação a mesa publica direto no Pull Request.")
        }
        log.info("Gerar prévia: desligada", { workbenchId: id, stage })
        pumpBuildQueue()
        return getWorkbench(id)
    }

    if (stage === "pr_open" && idle && !doc.pendingTurn) {
        const waiting = await enterBuildQueueOrWait(current)
        if (waiting) {
            const position = await slotQueuePosition(id)
            notice(`Geração de prévia ligada. Limite de ${config.maxConcurrent} mesa(s) ocupando vaga nesta central: "Gerar a prévia" aguarda vaga${position ? ` (posição #${position})` : ""} e começa sozinho quando liberar.`)
        } else {
            notice(`Geração de prévia ligada: gerando a prévia do código atual (${config.environment.previewMethod === "github" ? "build no GitHub" : "fila do build"}).`)
        }
    } else {
        notice("Geração de prévia ligada: a próxima implementação volta a passar pela prévia.")
    }
    log.info("Gerar prévia: ligada", { workbenchId: id, stage })
    return getWorkbench(id)
}

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------

interface TurnPlan {
    stage: WorkbenchStage
    text: string
    /** Reconexão: acompanha a execução em andamento sem enviar prompt nem trocar agente/modelo. */
    attach?: boolean
    /** Turno "Subindo a prévia": método, porta, máquina e Docker do build (o app roda o comando). */
    build?: { method: "local" | "github"; port: number; local: boolean; docker: PreviewDocker | null }
    /** Anexos da mensagem do usuário (`agentic_files`): vão no prompt deste turno (os encadeados não reenviam). */
    fileIds?: string[]
}

/** Log do build (aba Build): melhor esforço — uma falha no registro nunca derruba o build. */
async function trackBuild(id: string, action: () => Promise<unknown>): Promise<void> {
    try {
        await action()
    } catch (error) {
        logger.warn({ err: error, workbenchId: id }, "[agentic] Falha ao registrar o log do build")
    }
}

interface LaunchOptions {
    /** Texto do usuário exibido na mesa antes do turno. */
    userText?: string
    /** Pedido que origina a próxima versão do plano. */
    feedback?: string | null
    extraSet?: Record<string, unknown>
    /** Ignora o limite de mesas abertas (a limpeza da exclusão nunca espera uma vaga). */
    bypassLimit?: boolean
    /** Ação do usuário (ou do PR) que originou o turno (gatilho do Agente Mentor). */
    action?: PendingTurnAction
}

/** Turno bem-sucedido da cadeia, com o bloco de lição do desenvolvedor já retirado (Agente Mentor). */
type MentorTurns = Parameters<Awaited<ReturnType<typeof adversaryModule>>["mentorAfterTurns"]>[0]["turns"]

/** Agente Mentor: fim da cadeia de turnos → avalia em segundo plano (nunca bloqueia a mesa). */
async function notifyMentor(id: string, turn: TurnPlan, options: LaunchOptions, turns: MentorTurns): Promise<void> {
    if (turn.attach || turn.stage === "finishing") return
    const loaded = await loadAll(id)
    const { doc } = loaded
    await (
        await adversaryModule()
    ).mentorAfterTurns({
        workbenchId: id,
        centralId: doc.centralId,
        taskId: doc.taskId,
        taskCode: doc.taskCode,
        taskTitle: doc.taskTitle,
        projectName: loaded.projectName,
        repo: loaded.repo?.repo ?? null,
        approvedPlan: doc.plans?.at(-1)?.text ?? null,
        origin: { action: options.action ?? null, userText: options.userText ?? null, feedback: options.feedback ?? null },
        turns,
    })
}

/** Inicia um turno em segundo plano (as rotas respondem na hora; a saída chega pelo stream). */
async function launchTurn(loaded: Loaded, turn: TurnPlan, options: LaunchOptions = {}): Promise<void> {
    const id = String(loaded.doc._id)
    if (isWorkbenchActive(id)) throw new DomainError(409, "O agente já está trabalhando nesta mesa", "WORKBENCH_BUSY")
    // A reconexão não abre uma mesa nova: só a disponibilidade importa (o limite de mesas não se aplica).
    // A limpeza da exclusão também não espera vaga: a mesa precisa terminar de sair.
    if (turn.attach || options.bypassLimit) await assertAgenticReady(loaded.config)
    else await assertAvailable(loaded.doc.centralId, id, loaded.config)
    await prepareHub(id)
    const shown = turn.attach ? [] : await fileDtosFor(turn.fileIds)
    if (options.userText || shown.length) publishWorkbenchEvent(id, { type: "user", text: options.userText ?? "Arquivos anexados", ...(shown.length ? { files: shown } : {}) })
    const controller = new AbortController()
    const mentorTurns: MentorTurns = []
    markWorkbenchActive(id, controller)
    try {
        await update(loaded.doc, {
            stage: turn.stage,
            runState: "running",
            error: null,
            heartbeatAt: new Date(),
            // Reconectar preserva o turno original (o "Tentar novamente" e o marco de tempo continuam
            // válidos) e a causa da parada; um turno novo começa um episódio novo (limpa o desfecho).
            ...(turn.attach ? {} : { lastStage: turn.stage, lastPrompt: { stage: turn.stage, text: turn.text, ...(turn.fileIds?.length ? { fileIds: turn.fileIds } : {}) }, turnStartedAt: new Date(), stopRequestedAt: null, reconnect: null }),
            ...(options.feedback !== undefined ? { pendingFeedback: options.feedback } : {}),
            ...options.extraSet,
        })
    } catch (error) {
        clearWorkbenchActive(id, controller)
        throw error
    }
    void executeTurns(id, turn, controller, mentorTurns)
        .catch((error) => centralLogger(loaded.doc.centralId, loaded.doc.taskCode).error("Falha inesperada na mesa", error))
        .finally(() => {
            clearWorkbenchActive(id, controller)
            // Terminou um build (liberou a vaga) ou uma implementação/revisão adversária (entrou na fila): avalia a fila do build.
            if (turn.stage === "building" || turn.stage === "implementing" || turn.stage === "adversarial_review") pumpBuildQueue()
            void notifyMentor(id, turn, options, mentorTurns).catch((error) => centralLogger(loaded.doc.centralId, loaded.doc.taskCode).warn("Agente Mentor: avaliação não enfileirada", { workbenchId: id, error: errorText(error) }))
        })
}

/** Executa o turno e os encadeados (implementação → build), mantendo a mesa ativa entre eles. */
async function executeTurns(id: string, first: TurnPlan, controller: AbortController, mentorTurns: MentorTurns = []): Promise<void> {
    let turn: TurnPlan | null = first
    while (turn) {
        const loaded = await loadAll(id)
        const log = centralLogger(loaded.doc.centralId, loaded.doc.taskCode)
        if (turn !== first) await update(loaded.doc, { stage: turn.stage, runState: "running", error: null, lastStage: turn.stage, lastPrompt: { stage: turn.stage, text: turn.text }, heartbeatAt: new Date() })
        let next: TurnPlan | null = null
        // Agente Adversário: a revisão roda numa sessão própria (contexto limpo), fora da sessão da mesa.
        if (turn.stage === "adversarial_review") {
            try {
                next = await adversarialTurn(loaded, turn, controller)
            } catch (error) {
                log.error(`${WORKBENCH_STAGE_LABELS[turn.stage]}: falhou`, error, { workbenchId: id })
                await prepareHub(id)
                publishWorkbenchEvent(id, { type: "notice", level: "error", message: errorText(error) })
                await flushWorkbenchEvents(id)
                await update(loaded.doc, { runState: "failed", error: errorText(error), pendingPermissions: [], pendingForms: [] })
                return
            }
            turn = controller.signal.aborted ? null : next
            continue
        }
        const stage = turn.stage
        try {
            const client = await getOpencodeClient()
            const sessionId = turn.attach ? loaded.doc.sessionId : await ensureSession(client, loaded)
            if (!sessionId) throw new Error("A mesa não tem uma sessão do OpenCode para reconectar")
            if (turn.stage === "building") {
                // O app roda o build (saída ao vivo na aba Build); o agente só prepara e corrige uma falha.
                next = await buildTurn(client, loaded, turn, sessionId, controller)
                turn = controller.signal.aborted ? null : next
                continue
            }
            // Resumos de forks que não puderam virar instrução da sessão vão no prompt (uma vez).
            const notes = turn.attach ? null : await AgenticWorkbench.findById(id).select({ forkNotes: 1, forkNotesSynced: 1 }).lean()
            const withNotes = notes ? await withUnsyncedForkNotes({ _id: loaded.doc._id, forkNotes: notes.forkNotes ?? [], forkNotesSynced: notes.forkNotesSynced }, turn.text) : turn.text
            // Anexos do usuário: só no turno que recebeu a mensagem (não na reconexão nem nos turnos encadeados).
            const attachments = turn === first && !turn.attach && turn.fileIds?.length ? await promptFilesFor(turn.fileIds, { downloadDir: agenticDownloadDir(loaded.doc.taskCode), signal: controller.signal }) : { files: [], section: "" }
            const text = withAttachmentsSection(withNotes, attachments.section)
            // Agente Mentor: pode pedir ao agente um bloco de lição no fim da resposta.
            const adversary = await adversaryModule()
            const stageText = turn.attach ? text : await adversary.mentorPrepareTurn({ centralId: loaded.doc.centralId, stage: turn.stage, text })
            const raw = await runStageAgent(client, loaded, { stage: turn.stage, text: stageText, attach: turn.attach, files: attachments.files }, sessionId, controller)
            // O bloco de lição sai da resposta antes de a mesa interpretar o turno (plano, JSON da etapa).
            const taken = raw.outcome === "succeeded" ? adversary.mentorTakeLesson(raw.text) : null
            const result = taken ? { ...raw, text: taken.text } : raw
            if (taken) mentorTurns.push({ stage: turn.stage, text: taken.text, lesson: taken.lesson, lessonError: taken.error })
            if (result.outcome !== "succeeded") {
                await update(loaded.doc, { runState: result.outcome === "interrupted" ? "interrupted" : "failed", error: result.message ?? "O agente não concluiu a etapa" })
                return
            }
            const fresh = await loadAll(id)
            // Exclusão pedida durante o turno: não avança a etapa — a limpeza da exclusão assume daqui.
            if (fresh.doc.deletionRequestedAt && turn.stage !== "finishing") return
            next = await afterTurn(client, fresh, turn.stage, result)
        } catch (error) {
            if (stage === "building") {
                await trackBuild(id, () => settleBuild(id, "failed", errorText(error)))
                const current = await AgenticWorkbench.findById(id).lean()
                if (current?.previewBuild?.method === "github") await invalidateRemotePreview(await getOpencodeClient(), current, loaded.config.sessionDirectory).catch(() => undefined)
            }
            log.error(`${WORKBENCH_STAGE_LABELS[stage]}: falhou`, error, { workbenchId: id })
            await prepareHub(id)
            publishWorkbenchEvent(id, { type: "notice", level: "error", message: errorText(error) })
            await flushWorkbenchEvents(id)
            await update(loaded.doc, { runState: "failed", error: errorText(error), pendingPermissions: [], pendingForms: [] })
            return
        }
        turn = controller.signal.aborted ? null : next
    }
}

/** Turno do agente na sessão da mesa (com os modelos de fallback do papel da etapa). */
async function runStageAgent(
    client: OpencodeClient,
    loaded: Loaded,
    step: { stage: WorkbenchStage; text: string; attach?: boolean; files?: Awaited<ReturnType<typeof promptFilesFor>>["files"] },
    sessionId: string,
    controller: AbortController,
): Promise<TurnResult> {
    const id = String(loaded.doc._id)
    const log = centralLogger(loaded.doc.centralId, loaded.doc.taskCode)
    const { settings } = await loadAgenticSettings()
    const role = STAGE_ROLE[step.stage] ?? "planning"
    // Modelo trocado na mesa para o papel da etapa, relido a cada turno (o agente continua o configurado).
    const agent = workbenchTurnAgent(settings, loaded.config, loaded.doc, role)
    log.step(`${WORKBENCH_STAGE_LABELS[step.stage]}: turno iniciado`, { workbenchId: id, agent: agent.agent, model: agent.model })
    // Modelo/provedor falhou: segue com os modelos de fallback do papel (só neste turno).
    const result = await runWithFallback(
        agent,
        step.text,
        (attempt, prompt) =>
            runAgentTurn(
                client,
                {
                    workbenchId: id,
                    sessionId,
                    stage: step.stage,
                    title: WORKBENCH_STAGE_LABELS[step.stage],
                    agent: attempt,
                    text: prompt,
                    timeoutMs: TURN_TIMEOUT_MS,
                    signal: controller.signal,
                    attach: step.attach,
                    startedAt: loaded.doc.turnStartedAt ? new Date(loaded.doc.turnStartedAt).getTime() : 0,
                    files: step.files,
                },
                turnHooks(loaded.doc),
            ),
        {
            signal: controller.signal,
            attach: step.attach,
            onSwitch: async (change) => {
                publishWorkbenchEvent(id, { type: "notice", level: "warn", message: fallbackNotice(change) })
                log.warn(`${WORKBENCH_STAGE_LABELS[step.stage]}: modelo de fallback`, { workbenchId: id, from: change.from.model, to: change.to.model, reason: change.reason })
                await AgenticWorkbench.updateOne({ _id: loaded.doc._id }, { $set: { pendingPermissions: [], pendingForms: [], heartbeatAt: new Date() } })
            },
        },
    )
    await AgenticWorkbench.updateOne({ _id: loaded.doc._id }, { $set: { pendingPermissions: [], pendingForms: [] } })
    await flushWorkbenchEvents(id)
    log[result.outcome === "succeeded" ? "success" : "warn"](`${WORKBENCH_STAGE_LABELS[step.stage]}: ${result.outcome === "succeeded" ? "concluído" : (result.message ?? result.outcome)}`, {
        workbenchId: id,
        durationMs: result.durationMs,
        costUsd: result.costUsd,
    })
    return result
}

type BuildAgentStep = { kind: "prepare" | "fix"; text: string; attach: boolean }

/**
 * "Subindo a prévia": o app roda o comando do build no host (saída ao vivo na aba Build) — o
 * `docker compose … up -d --build` (Local) ou o script da prévia no GitHub Action. Antes, quando há o
 * que preparar (dump do MongoDB com o backup ligado; commit no GitHub Action), um turno curto do agente
 * prepara o worktree. Se o comando falhar, o agente corrige o código num turno da sessão da mesa e o
 * app roda de novo, no mesmo build (no GitHub Action, numa tentativa nova com o SHA novo) — sem limite
 * de correções: só para quando passa, quando o agente desiste (`ok: false`), num tempo esgotado/processo
 * morto ou quando o usuário interrompe. Na reconexão retoma o comando que ainda roda no host
 * (`previewBuild.job`) ou acompanha o turno do agente em andamento.
 */
async function buildTurn(client: OpencodeClient, loaded: Loaded, turn: TurnPlan, sessionId: string, controller: AbortController): Promise<TurnPlan | null> {
    const { doc, config } = loaded
    const id = String(doc._id)
    const ctx = contextOf(loaded)
    const log = centralLogger(doc.centralId, doc.taskCode)
    const notice = (level: "info" | "warn" | "success" | "error", message: string) => publishWorkbenchEvent(id, { type: "notice", level, message })
    const saved = doc.previewBuild ?? null
    const method = turn.build?.method ?? saved?.method ?? "local"
    const port = turn.build?.port ?? saved?.port ?? (typeof doc.port === "number" ? doc.port : null)
    if (port === null) throw new Error("A mesa ficou sem porta reservada")
    const docker = method === "local" ? ((turn.build ? turn.build.docker : saved?.docker) ?? undefined) : undefined
    const remote = method === "github"
    // O dump só entra quando a central o exige nesta tentativa (OPE-72); o servidor confere o arquivo.
    const backup = saved?.dumpRequired !== false ? (doc.previewBackup ?? null) : null
    const hooks = turnHooks(doc)
    await trackBuild(id, () => (turn.attach ? resumeBuild(id) : startBuild(id, { port, local: turn.build?.local ?? Boolean(docker), method })))
    await publishAgentic({ centralId: doc.centralId, workbenchId: id, taskId: doc.taskId })

    const needsPrepare = remote || Boolean(backup)
    let resumeJob = turn.attach ? (saved?.job ?? null) : null
    let step: BuildAgentStep | null = null
    // Reconexão sem comando no host: o agente estava preparando ou corrigindo (acompanha o turno dele).
    if (turn.attach && !resumeJob) step = { kind: needsPrepare && !saved?.prepared ? "prepare" : "fix", text: "", attach: true }
    else if (!turn.attach && needsPrepare && !saved?.prepared) step = { kind: "prepare", text: previewPreparePrompt(config, ctx, { method, backup }), attach: false }
    let round = 0
    for (;;) {
        if (step) {
            if (step.kind === "prepare" && !step.attach) appendBuildOutput(id, buildPrepareSeparator([backup ? "dump do MongoDB" : "", remote ? "commit" : ""].filter(Boolean).join(" e ")))
            const result = await runStageAgent(client, loaded, { stage: "building", text: step.text, attach: step.attach }, sessionId, controller)
            if (result.outcome !== "succeeded") {
                const status = result.outcome === "interrupted" ? "interrupted" : "failed"
                await trackBuild(id, () => settleBuild(id, status, result.message ?? null))
                if (remote) await invalidateRemotePreview(client, (await AgenticWorkbench.findById(id).lean()) ?? doc, config.sessionDirectory).catch(() => undefined)
                await update(doc, { runState: status, error: result.message ?? "O agente não concluiu a etapa" })
                return null
            }
            const parsed = buildResultSchema.safeParse(extractJsonBlock(result.text))
            if (parsed.success && !parsed.data.ok) throw new Error(`${step.kind === "prepare" ? "O agente não conseguiu preparar a prévia" : "O agente não conseguiu corrigir o build"}: ${parsed.data.error ?? "motivo não informado"}`)
            const fresh = await loadAll(id)
            // Exclusão pedida durante o turno: a limpeza da exclusão assume daqui.
            if (fresh.doc.deletionRequestedAt || controller.signal.aborted) return null
            if (step.kind === "prepare") {
                if (backup) {
                    await assertPreviewBackup(client, backup, config.sessionDirectory)
                    notice("info", "Backup do MongoDB confirmado antes da publicação da prévia.")
                }
                await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { "previewBuild.prepared": true } })
            } else if (remote) {
                // A correção foi commitada: uma tentativa nova (SHA novo) no lugar da que falhou.
                if (!fresh.repo) throw new Error("Vincule um repositório GitHub à central para construir a prévia")
                if (!fresh.doc.previewBackup) throw new Error("Não foi possível reservar a pasta da prévia remota")
                await invalidateRemotePreview(client, fresh.doc, config.sessionDirectory)
                await reserveRemotePreview(client, fresh.doc, config, fresh.repo.repo, port, await effectivePorts(config.environment), fresh.doc.previewBackup, ctx)
                await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { "previewBuild.port": port, "previewBuild.prepared": true } })
            }
            step = null
        }
        const current = (await AgenticWorkbench.findById(id).select({ previewBuild: 1 }).lean())?.previewBuild ?? null
        let commands: { command: string; run: string }
        if (remote) {
            if (!current?.attempt || !current.statePath) throw new Error("Tentativa remota sem reserva")
            commands = remotePreviewCommands(ctx, { attempt: current.attempt, statePath: current.statePath })
        } else {
            commands = previewBuildCommands(config, ctx, port, docker)
        }
        const jobId = resumeJob ?? newJobId("build")
        await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { "previewBuild.job": jobId, heartbeatAt: new Date() } })
        if (resumeJob) {
            restartBuildSection(id)
        } else {
            beginBuildSection(id, commands.command)
            notice("info", `Rodando o build da prévia${remote ? " no GitHub Action" : ""} (saída ao vivo na aba Build): ${commands.command}`)
        }
        resumeJob = null
        log.step(`${WORKBENCH_STAGE_LABELS.building}: ${remote ? "script da prévia remota" : "docker compose"}`, { workbenchId: id, jobId })
        const timeoutMinutes = remote ? Math.max(REMOTE_BUILD_MIN_MINUTES, config.environment.buildTimeoutMinutes) : config.environment.buildTimeoutMinutes
        const run = await runPreviewBuild({
            run: commands.run,
            jobId,
            timeoutMs: timeoutMinutes * 60_000,
            signal: controller.signal,
            onOutput: (chunk) => appendBuildOutput(id, chunk),
            heartbeat: hooks.heartbeat,
        })
        appendBuildOutput(id, buildExitLine(run.exitCode))
        await AgenticWorkbench.updateOne({ _id: doc._id }, { $unset: { "previewBuild.job": 1 } })
        if (controller.signal.aborted) {
            const message = errorText(controller.signal.reason ?? "Interrompido")
            await trackBuild(id, () => settleBuild(id, "interrupted", message))
            await update(doc, { runState: "interrupted", error: message })
            return null
        }
        if (run.exitCode === 0) {
            const fresh = await loadAll(id)
            // Exclusão pedida durante o build: a limpeza da exclusão assume daqui.
            if (fresh.doc.deletionRequestedAt) return null
            return afterBuild(client, fresh)
        }
        if (run.exitCode === null) throw new Error(`O build da prévia não terminou${run.tail ? `: ${run.tail.split("\n").at(-1)}` : ""}`)
        // Tempo esgotado ou processo morto pelo sistema: não é algo que o agente corrija no código.
        const terminal = terminalBuildFailure(run.exitCode, timeoutMinutes)
        if (terminal) throw new Error(terminal)
        round += 1
        log.warn(`${WORKBENCH_STAGE_LABELS.building}: build falhou`, { workbenchId: id, exitCode: run.exitCode, round })
        notice("warn", `O build da prévia falhou (exit ${run.exitCode}). O agente vai corrigir o código e o build roda de novo (correção ${round}).`)
        appendBuildOutput(id, buildFixSeparator(round))
        step = { kind: "fix", text: buildFixPrompt(config, ctx, port, { exitCode: run.exitCode, tail: run.tail, round, command: commands.command }, { docker, method }), attach: false }
    }
}

/**
 * Build da prévia passou (exit 0): no GitHub Action confere a publicação confirmada da tentativa;
 * espera a prévia responder e segue para a prévia (ou o PR automático).
 */
async function afterBuild(client: OpencodeClient, loaded: Loaded): Promise<TurnPlan | null> {
    const { doc, config } = loaded
    const id = String(doc._id)
    const notice = (level: "info" | "warn" | "success" | "error", message: string) => publishWorkbenchEvent(id, { type: "notice", level, message })
    const remote = doc.previewBuild?.method === "github"
    await assertRemotePreview(client, doc, config.sessionDirectory)
    const fresh = await AgenticWorkbench.findById(id).select({ port: 1, agenticFlow: 1 }).lean()
    if (typeof fresh?.port !== "number") throw new Error("A mesa ficou sem porta reservada")
    const env = config.environment
    const previewUrl = `http://${env.previewHost}:${fresh.port}`
    const healthy = await waitForPreview(`${previewUrl}${env.healthPath || "/"}`)
    if (!healthy && remote) throw new Error(`A prévia não respondeu em ${previewUrl}`)
    notice(healthy ? "success" : "warn", healthy ? `Prévia no ar em ${previewUrl}` : `O build terminou, mas ${previewUrl} não respondeu ao app`)
    await trackBuild(id, () => settleBuild(id, healthy ? "succeeded" : "unhealthy", healthy ? null : `${previewUrl} não respondeu ao app`))
    // A chave "Gerar prévia" foi desligada durante o build: publica no PR sem parar na prévia.
    if (asAgenticFlow(fresh.agenticFlow) === "auto_pr") {
        await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { previewUrl, previewHealthy: healthy } })
        notice("info", "Geração de prévia desligada: publicando no Pull Request sem parar na prévia.")
        return autoPrTurn(loaded)
    }
    await update(doc, { stage: "preview", runState: "idle", previewUrl, previewHealthy: healthy })
    pumpQueue(doc.centralId)
    return null
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
    // Sessão nova: os resumos de forks integrados ao contexto voltam a valer nela.
    if (doc.forkNotes?.length) await applyForkNotes(client, doc, session.id)
    return session.id
}

/**
 * Agente Adversário: uma rodada de revisão (sessão nova, só leitura) e o que vem depois — seguir para
 * a prévia/PR, corrigir automaticamente (turno de implementação), aguardar o usuário
 * (`adversarial_blocked`) ou parar com a falha (Tentar novamente / Seguir mesmo assim).
 */
async function adversarialTurn(loaded: Loaded, turn: TurnPlan, controller: AbortController): Promise<TurnPlan | null> {
    const { doc, config } = loaded
    const id = String(doc._id)
    const ctx = contextOf(loaded)
    const log = centralLogger(doc.centralId, doc.taskCode)
    const hooks = turnHooks(doc)
    const { runAdversaryRound } = await adversaryModule()
    log.step(`${WORKBENCH_STAGE_LABELS.adversarial_review}: turno iniciado`, { workbenchId: id })
    const outcome = await runAdversaryRound({
        workbenchId: id,
        centralId: doc.centralId,
        taskId: doc.taskId,
        taskCode: doc.taskCode,
        taskTitle: doc.taskTitle,
        worktreePath: ctx.worktreePath,
        branch: ctx.branch,
        baseBranch: config.git.baseBranch,
        plans: (doc.plans ?? []).map((plan) => ({ version: plan.version, text: plan.text, feedback: plan.feedback ?? null })),
        centralInstructions: config.instructions.implementation,
        implementationText: turn.text,
        signal: controller.signal,
        onStep: hooks.onStep,
        heartbeat: hooks.heartbeat,
    })
    await flushWorkbenchEvents(id)
    const notice = (level: "info" | "warn" | "success" | "error", message: string) => publishWorkbenchEvent(id, { type: "notice", level, message })
    log[outcome.kind === "failed" ? "warn" : "info"](`${WORKBENCH_STAGE_LABELS.adversarial_review}: ${outcome.kind}`, { workbenchId: id, message: outcome.message })
    const fresh = await loadAll(id)
    // Exclusão pedida durante a revisão: não avança — a limpeza da exclusão assume daqui.
    if (fresh.doc.deletionRequestedAt) return null
    switch (outcome.kind) {
        case "proceed":
            notice(outcome.level, outcome.message)
            return afterImplementation(fresh)
        case "fix":
            notice("warn", outcome.message)
            return { stage: "implementing", text: outcome.text }
        case "blocked":
            notice("warn", outcome.message)
            await update(doc, { stage: "adversarial_blocked", runState: "idle", error: null })
            // Aguardando o usuário não ocupa vaga: a próxima mesa da central pode executar.
            pumpQueue(doc.centralId)
            return null
        case "failed":
        case "interrupted":
            notice(outcome.kind === "failed" ? "error" : "warn", outcome.message)
            await update(doc, { runState: outcome.kind, error: outcome.message })
            return null
    }
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
            // Plano pronto não ocupa vaga: a próxima mesa da central pode executar.
            pumpQueue(doc.centralId)
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
            // Agente Adversário: revisão com contexto limpo antes da prévia/PR (a resposta do
            // implementador segue no turno: traz as contestações de uma correção).
            if (await (await adversaryModule()).adversaryApplies(doc.centralId)) {
                notice("info", "Implementação concluída. O agente adversário vai revisar o código antes de seguir.")
                return { stage: "adversarial_review", text: result.text }
            }
            return afterImplementation(loaded)
        }
        case "building":
            // O build roda em `buildTurn` (não é um turno comum do agente).
            return afterBuild(client, loaded)
        case "opening_pr": {
            const parsed = prResultSchema.safeParse(extractJsonBlock(result.text))
            const found = parsed.success ? { url: parsed.data.url, number: parsed.data.number ?? extractPrUrl(parsed.data.url)?.number } : extractPrUrl(result.text)
            if (!found?.url || !found.number) throw new Error("O agente não informou a URL do Pull Request")
            const keep = doc.pr && doc.pr.number === found.number
            const pr: IWorkbenchPr = keep ? { ...doc.pr!, url: found.url, state: "open" } : { number: found.number, url: found.url, state: "open", mergedAt: null, mergeCommitSha: null, lastReviewId: 0, lastCommentId: 0, closedNotified: false, conflictBaseSha: null, conflictHeadSha: null }
            notice("success", keep ? `PR #${pr.number} atualizado` : `PR #${pr.number} aberto: ${pr.url}`)
            await update(doc, { stage: "pr_open", runState: "idle", pr })
            pumpQueue(doc.centralId)
            const prColumn = loaded.columns.onPr
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
            pumpQueue(doc.centralId)
            return null
        }
        case "fixing_ci": {
            const parsed = ciFixResultSchema.safeParse(extractJsonBlock(result.text))
            if (!parsed.success || !parsed.data.ok) {
                throw new Error(`A correção do CI não foi concluída: ${parsed.success ? (parsed.data.error ?? "o agente não confirmou a publicação") : "resposta sem o bloco JSON esperado"}`)
            }
            // Só reexecução (sem push): o código não mudou e a prévia continua valendo.
            const rerun = Boolean(parsed.data.rerun && !parsed.data.sha)
            notice("success", rerun ? `CI do PR #${doc.pr?.number ?? ""}: falhas reexecutadas (causa fora do código). O PR volta a aguardar o CI.` : `CI do PR #${doc.pr?.number ?? ""} corrigido e enviado (push). O PR volta a aguardar o CI.`)
            if (!rerun && doc.previewHealthy) notice("warn", "A prévia pode estar desatualizada em relação ao código publicado na correção do CI.")
            await update(doc, { stage: "pr_open", runState: "idle", ...(!rerun && doc.previewHealthy ? { previewHealthy: false } : {}) })
            await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: doc.taskCode, pr: doc.pr?.url ?? null, ciCorrigido: rerun ? "reexecução" : (parsed.data.sha ?? "push") } })
            pumpQueue(doc.centralId)
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
            if (doc.deletionRequestedAt) {
                // Exclusão: uma limpeza incompleta NÃO pode liberar a mesa para ser apagada.
                if (parsed.success && !parsed.data.ok) throw new Error(`A limpeza não foi concluída: ${parsed.data.error ?? "motivo não informado"}`)
                await assertCleanupDone(client, cleanupTargets(config, doc), ctx)
                // Ambiente limpo: a mesa esquece os recursos (a retomada só precisa excluir a sessão) e sai.
                await update(doc, { previewBackup: null, previewBuild: null, worktreePath: null, branch: null, previewUrl: null, previewHealthy: null, buildQueuedAt: null })
                await removeWorkbenchSessions(doc)
                await finalizeDeletion(doc)
                return null
            }
            if (parsed.success && !parsed.data.ok) notice("warn", `Limpeza incompleta: ${parsed.data.error ?? "motivo não informado"}`)
            // A mesa só conclui quando o dump foi removido (idempotente: ausente conta como sucesso).
            if (doc.previewBackup) {
                await assertPreviewBackupRemoved(client, doc.previewBackup, config.sessionDirectory)
                notice("info", "Backup do MongoDB da prévia removido.")
            }
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
        { stage: "done", runState: "idle", completedAt: new Date(), error: null, previewUrl: null, previewHealthy: null, previewBackup: null, sessionId: null, sessionDirectory: null },
        sessionId ? { $addToSet: { pendingSessionDeletions: sessionId } } : {},
    )
    publishWorkbenchEvent(String(doc._id), { type: "notice", level: "success", message: "Mesa de trabalho concluída" })
    centralLogger(doc.centralId, doc.taskCode).success("Mesa concluída", { workbenchId: String(doc._id) })
    if (sessionId) {
        const removed = await deleteWorkbenchSession(String(doc._id), sessionId).catch(() => false)
        if (removed) publishWorkbenchEvent(String(doc._id), { type: "notice", level: "info", message: "Sessão do OpenCode excluída" })
        else publishWorkbenchEvent(String(doc._id), { type: "notice", level: "info", message: "A sessão do OpenCode será excluída assim que o serviço estiver disponível" })
    }
    // Forks em aberto: concluir, manter ou perguntar, conforme a central.
    try {
        const { config } = await loadCentral(doc.centralId)
        await (await forksModule()).handleWorkbenchDone(doc, config.forks.onWorkbenchDone)
    } catch (error) {
        centralLogger(doc.centralId, doc.taskCode).warn("Falha ao tratar os forks na conclusão da mesa", { workbenchId: String(doc._id), error: errorText(error) })
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
async function applyStartEffects(id: string, task: TaskDetailDto, columns: AgenticColumns): Promise<void> {
    const notice = (level: "info" | "warn", message: string) => publishWorkbenchEvent(id, { type: "notice", level, message })
    const target = columns.onStart
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
    const target = reopenTargetColumn(loaded.columns, await entryColumnForProject(loaded.projectId))
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
    // Mesa em exclusão: nunca sobe um build; ela só precisa terminar de sair.
    if (loaded.doc.deletionRequestedAt) return false
    if (asStage(loaded.doc.stage) !== "build_queued") return false
    const turn = await prepareBuildTurn(loaded, "local")
    await launchTurn(loaded, turn, { extraSet: { buildQueuedAt: null } })
    return true
}

async function prepareBuildTurn(loaded: Loaded, method: "local" | "github"): Promise<TurnPlan> {
    const id = String(loaded.doc._id)
    const env = loaded.config.environment
    const ctx = contextOf(loaded)
    // Builder Machine: com o túnel aberto o build local vai para o Docker do PC. A prévia no GitHub
    // Action fica sempre no servidor (derruba a prévia anterior que estava no PC).
    const local = await localDockerHooks()
    const target = local
        ? await local.resolveBuildTarget({
              workbenchId: id,
              centralId: loaded.doc.centralId,
              composeProject: ctx.composeProject,
              worktreePath: ctx.worktreePath,
              composeFile: env.composeFile.trim(),
              portEnvVar: env.portEnvVar,
              hadPort: typeof loaded.doc.port === "number",
              forceServer: method !== "local",
          })
        : null
    const range = await effectivePorts(env)
    const port = await allocatePreviewPort(id, env.previewHost, range, target?.portCheck)
    // No PC, o override do compose leva as CAs do PC aos containers (redes com inspeção TLS).
    const attached = target ? await target.attach(port) : null
    // Política efetiva desta tentativa (OPE-72): desligar o backup na central não altera o turno em andamento.
    const dumpRequired = loaded.config.environment.backupDatabase
    // O caminho do backup é reservado ANTES do turno (o agente cria o dump ali antes de publicar) e é
    // preservado nas retentativas: o primeiro dump é o backup da mesa (OPE-54). Sem dump exigido a
    // reserva só acontece no modo remoto, onde a pasta também guarda o estado da tentativa.
    const backup = dumpRequired || method === "github" ? await reservePreviewBackup(loaded.doc, loaded.config) : null
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "notice", level: "info", message: `Porta reservada para a prévia: ${port}${target ? " (prévia na máquina local)" : ""}` })
    if (attached?.notice) publishWorkbenchEvent(id, { type: "notice", level: attached.notice.level, message: attached.notice.message })
    publishWorkbenchEvent(id, {
        type: "notice",
        level: "info",
        message: dumpRequired && backup ? `Backup do MongoDB da prévia em ${backup.dir}` : "Backup do banco de dados desativado nesta central: a prévia sobe sem dump.",
    })
    const docker = target ? { prefix: target.dockerPrefix, ...(attached?.composeFiles?.length ? { files: attached.composeFiles } : {}) } : null
    if (method === "github") {
        if (!loaded.repo) throw new Error("Vincule um repositório GitHub à central para construir a prévia")
        if (!backup) throw new Error("Não foi possível reservar a pasta da prévia remota")
        const remote = await reserveRemotePreview(await getOpencodeClient(), loaded.doc, loaded.config, loaded.repo.repo, port, range, backup, ctx)
        await AgenticWorkbench.updateOne({ _id: loaded.doc._id }, { $set: { "previewBuild.port": port } })
        return { stage: "building", text: remotePreviewCommands(ctx, remote).command, build: { method, port, local: false, docker: null } }
    }
    await AgenticWorkbench.updateOne({ _id: loaded.doc._id }, { $set: { previewBuild: { method: "local", dumpRequired, port, docker }, buildQueuedAt: null } })
    // O backup só entra no preparo (e na conferência do servidor) quando a central o exige; sem ele a
    // prévia sobe sem dump — projetos sem banco de dados (OPE-72).
    return { stage: "building", text: previewBuildCommands(loaded.config, ctx, port, docker ?? undefined).command, build: { method, port, local: Boolean(target), docker } }
}

/** A prévia da mesa estava no PC e a Builder Machine a derrubou (ou a deixou pendente): o agente pula o `down`. */
async function localPreviewTornDown(loaded: Loaded): Promise<boolean> {
    if (!loaded.config.cleanup.teardownEnvironment) return false
    const local = await localDockerHooks()
    return local ? local.teardownForCleanup(String(loaded.doc._id)) : false
}

export async function startWorkbench(centralId: string, taskId: string, text?: string, fileIds?: string[]): Promise<WorkbenchDto> {
    return runInCentral(centralId, () => startWorkbenchInCentral(centralId, taskId, text, fileIds))
}

/** Chamado pelo motor já dentro da decisão serializada de vagas da central. */
export async function startWorkbenchInCentral(centralId: string, taskId: string, text?: string, fileIds?: string[]): Promise<WorkbenchDto> {
    const { doc: central, config } = await loadCentral(centralId)
    await dbConnect()
    const files = await loadClaimableFiles(fileIds, null)
    const existing = await AgenticWorkbench.findOne({ taskId }).lean()
    if (existing) throw new DomainError(409, "Esta tarefa já tem uma mesa de trabalho", "WORKBENCH_EXISTS", { workbenchId: String(existing._id) })
    const task = await getTask(taskId)
    if (task.project?.id !== central.projectId) throw new DomainError(400, `A tarefa ${task.code} não é do projeto ${central.projectName}`, "TASK_OTHER_PROJECT")
    await assertAvailable(centralId, null, config)
    if (await AgenticWorkbench.exists({ centralId, pendingTurn: { $ne: null } })) {
        throw new DomainError(409, "Há mesas aguardando retomada nesta central; elas têm prioridade", "CENTRAL_BUSY")
    }
    // Colunas efetivas e fluxo padrão da central: a escolha da tarefa vence; sem ela, vale
    // `environment.publishPreview`. O fluxo resolvido é gravado na mesa (não muda depois).
    const { settings } = await loadAgenticSettings()
    const columns = resolveCentralColumns(settings.columns, config.columns)
    const agenticFlow = resolveCentralFlow(config.environment.publishPreview, task.agenticFlow)

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
                agenticFlow,
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
    await applyStartEffects(id, task, columns)
    const loaded: Loaded = { doc, config, columns, ci: resolveCentralCi(settings.ci, config.git), projectName: central.projectName, projectId: central.projectId, repo: await repoForProject(central.projectId) }
    // Informações adicionais digitadas na abertura vão no primeiro prompt (junto da tarefa).
    const additionalInfo = text?.trim() || null
    await launchTurn(
        loaded,
        { stage: "planning", text: planPrompt(config, contextOf(loaded), taskMarkdown(task, config), additionalInfo), ...fileIdsOf(files) },
        { ...(additionalInfo ? { userText: additionalInfo } : files.length ? { userText: "Informações adicionais (arquivos anexados)" } : {}) },
    )
    await claimAgenticFiles(files, { workbenchId: id })
    return getWorkbench(id)
}

export async function revisePlan(id: string, feedback: string, fileIds?: string[]): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "revise-plan")
    const files = await loadClaimableFiles(fileIds, id)
    await launchOrQueue(loaded, "revise-plan", { stage: "planning", text: revisePlanPrompt(loaded.config, feedback), ...fileIdsOf(files) }, { userText: feedback, feedback })
    await claimAgenticFiles(files, { workbenchId: id })
    return getWorkbench(id)
}

export async function implement(id: string, additionalInfo?: string, fileIds?: string[]): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "implement")
    const files = await loadClaimableFiles(fileIds, id)
    const ctx = contextOf(loaded)
    // Informações adicionais digitadas ao aprovar o plano vão no prompt de implementação.
    const info = additionalInfo?.trim() || null
    const userText = info ? `Plano aprovado: implementar\n\n${info}` : "Plano aprovado: implementar"
    await launchOrQueue(
        loaded,
        "implement",
        { stage: "implementing", text: implementPrompt(loaded.config, ctx, loaded.doc.plans?.length ?? 1, info), ...fileIdsOf(files) },
        { userText, extraSet: { branch: ctx.branch, worktreePath: ctx.worktreePath, composeProject: ctx.composeProject } },
    )
    await claimAgenticFiles(files, { workbenchId: id })
    return getWorkbench(id)
}

/** Correção pedida na prévia (ou após falha na implementação/build): volta ao planejamento. */
export async function requestCorrection(id: string, feedback: string, fileIds?: string[]): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "request-correction")
    const files = await loadClaimableFiles(fileIds, id)
    await invalidateRemotePreview(await getOpencodeClient(), loaded.doc, loaded.config.sessionDirectory)
    await launchOrQueue(loaded, "request-correction", { stage: "planning", text: previewCorrectionPrompt(loaded.config, feedback), ...fileIdsOf(files) }, { userText: feedback, feedback })
    await claimAgenticFiles(files, { workbenchId: id })
    return getWorkbench(id)
}

export async function approve(id: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "approve")
    const task = await getTask(loaded.doc.taskId)
    const pr = loaded.doc.pr && loaded.doc.pr.state === "open" ? { number: loaded.doc.pr.number, url: loaded.doc.pr.url } : null
    await launchOrQueue(loaded, "approve", { stage: "opening_pr", text: prPrompt(loaded.config, contextOf(loaded), { code: task.code, title: task.title }, pr) }, { userText: "Prévia aprovada: abrir o Pull Request" })
    return getWorkbench(id)
}

// ---------------------------------------------------------------------------
// Agente Adversário: decisões do usuário depois de um bloqueio (ou de uma falha)
// ---------------------------------------------------------------------------

/** "Corrigir": o implementador corrige os achados bloqueantes que ficaram marcados (com a orientação opcional). */
export async function adversarialFix(id: string, input: { text?: string; excluded?: string[] }): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "adversarial-fix")
    const adversary = await adversaryModule()
    const text = await adversary.prepareUserFix(id, contextOf(loaded).worktreePath, input)
    const note = input.text?.trim()
    try {
        await launchOrQueue(loaded, "adversarial-fix", { stage: "implementing", text }, { userText: note ? `Corrigir os bloqueios do agente adversário\n\n${note}` : "Corrigir os bloqueios do agente adversário" })
    } catch (error) {
        await adversary.restoreAwaiting(id)
        throw error
    }
    return getWorkbench(id)
}

/** "Revisar de novo": nova rodada do adversário sobre o código atual. */
export async function adversarialRerun(id: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "adversarial-rerun")
    const adversary = await adversaryModule()
    await adversary.recordRerun(id)
    try {
        await launchOrQueue(loaded, "adversarial-rerun", { stage: "adversarial_review", text: "" }, { userText: "Revisar de novo (agente adversário)" })
    } catch (error) {
        await adversary.restoreAwaiting(id)
        throw error
    }
    return getWorkbench(id)
}

/** "Seguir mesmo assim": ignora os bloqueios (ou a falha do adversário) e segue para a prévia ou o PR. */
export async function adversarialSkip(id: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    const doc = await reconcile(loaded.doc)
    assertAction(doc, "adversarial-skip")
    const ready = { ...loaded, doc }
    await (await adversaryModule()).recordSkip(id)
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "user", text: "Seguir mesmo assim (sem os bloqueios do agente adversário)" })
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: doc.taskCode, agenteAdversario: "seguiu mesmo assim" } })
    if (asStage(doc.stage) === "adversarial_review") {
        // Revisão que falhou: a mesa ainda ocupa a vaga e segue direto (fila do build, build no GitHub ou PR).
        const next = await afterImplementation(ready)
        if (next) await launchTurn(ready, next)
        else pumpBuildQueue()
    } else if (await skipsPreview(id)) {
        await launchOrQueue(ready, "adversarial-skip", autoPrTurn(ready))
    } else if (await enterBuildQueueOrWait(ready)) {
        const position = await slotQueuePosition(id)
        publishWorkbenchEvent(id, { type: "notice", level: "info", message: `Limite de ${loaded.config.maxConcurrent} mesa(s) ocupando vaga nesta central: "Gerar a prévia" aguarda vaga${position ? ` (posição #${position})` : ""} e começa sozinho quando liberar.` })
    }
    return getWorkbench(id)
}

export async function submitPrFeedback(id: string, feedback: string, fileIds?: string[]): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "submit-pr-feedback")
    const files = await loadClaimableFiles(fileIds, id)
    await launchOrQueue(loaded, "submit-pr-feedback", { stage: "planning", text: prChangesPrompt(loaded.config, loaded.doc.pr?.url ?? "PR", feedback), ...fileIdsOf(files) }, { userText: feedback, feedback })
    await claimAgenticFiles(files, { workbenchId: id })
    return getWorkbench(id)
}

export async function reopen(id: string, feedback: string, fileIds?: string[]): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    assertAction(loaded.doc, "reopen")
    const files = await loadClaimableFiles(fileIds, id)
    // Com o limite cheio, a reabertura aguarda vaga; os efeitos (PR para o histórico, card) só rodam ao ganhar a vaga.
    await launchOrQueue(
        loaded,
        "reopen",
        { stage: "planning", text: reopenPrompt(loaded.config, contextOf(loaded), feedback, loaded.doc.plans?.at(-1)?.text ?? null), ...fileIdsOf(files) },
        { userText: `Mesa reaberta: ${feedback}`, feedback },
        { reopen: true },
    )
    await claimAgenticFiles(files, { workbenchId: id })
    return getWorkbench(id)
}

/** Efeitos da reabertura de uma mesa concluída (rodam imediatamente antes do turno de planejamento). */
async function applyReopen(loaded: Loaded): Promise<Loaded> {
    const id = String(loaded.doc._id)
    const pastPr = loaded.doc.pr ? { $push: { pastPrs: loaded.doc.pr } } : {}
    // Reabrir dispensa a pergunta sobre os forks em aberto (eles seguem utilizáveis).
    await AgenticWorkbench.updateOne({ _id: loaded.doc._id }, { $set: { pr: null, completedAt: null, previewBackup: null, forksDonePrompt: null, manualCompletion: null }, ...pastPr })
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: loaded.doc.taskCode, reaberta: true } })
    await applyReopenEffects(id, loaded)
    return { ...loaded, doc: { ...loaded.doc, pr: null } }
}

// ---------------------------------------------------------------------------
// Definir etapa / concluir sem PR (ação da tela e ferramentas do Agente Opex)
// ---------------------------------------------------------------------------

/**
 * Leva a mesa a uma etapa de espera (`MANUAL_STAGES`) ou a conclui sem PR, com o motivo registrado na
 * auditoria e na saída da mesa. As regras de transição são as de `manualStageBlock` (mesma regra na
 * tela). Um turno em andamento é interrompido e a espera por vaga/fila do build é descartada antes.
 */
export async function setWorkbenchStage(id: string, input: SetWorkbenchStageInput): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    let doc = await reconcile(loaded.doc)
    const from = asStage(doc.stage)
    const target = input.stage
    const reason = input.reason.trim()
    const block = manualStageBlock(target, { stage: from, hasPlan: (doc.plans ?? []).length > 0, hasPreview: Boolean(doc.previewUrl), prOpen: doc.pr?.state === "open", deleting: Boolean(doc.deletionRequestedAt) })
    if (block) throw new DomainError(409, block, doc.deletionRequestedAt ? "WORKBENCH_DELETING" : "WORKBENCH_INVALID_STAGE")
    await prepareHub(id)
    const notice = (level: "info" | "warn", message: string) => publishWorkbenchEvent(id, { type: "notice", level, message })

    // Libera a mesa: a intenção de parar é gravada antes (sem reconexão automática) e o turno vivo é abortado.
    const interrupted = isWorkbenchActive(id)
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { stopRequestedAt: new Date() } })
    if (interrupted) {
        if (doc.previewBuild?.method === "github" && from === "building") await invalidateRemotePreview(await getOpencodeClient(), doc, loaded.config.sessionDirectory).catch(() => undefined)
        if (doc.sessionId) {
            try {
                await (await getOpencodeClient()).session.interrupt({ sessionID: doc.sessionId })
            } catch {
                // sem OpenCode, o abort local abaixo já encerra o acompanhamento
            }
        }
        abortWorkbenchRun(id, "Etapa definida manualmente")
        await waitWorkbenchIdle(id)
        doc = await loadWorkbench(id)
    }
    const droppedWait = Boolean(doc.pendingTurn)
    const leftBuildQueue = Boolean(doc.buildQueuedAt)

    await recordAudit({
        userId: actorId(),
        entidade: AGENTIC_AUDIT_WORKBENCH,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { tarefa: doc.taskCode, etapa: from },
        depois: { tarefa: doc.taskCode, etapaAnterior: from, etapaDefinida: target, motivo: reason, manual: true, ...(interrupted ? { turnoInterrompido: true } : {}) },
    })
    notice("info", `Etapa definida manualmente: "${WORKBENCH_STAGE_LABELS[from]}" → "${WORKBENCH_STAGE_LABELS[target]}". Motivo: ${reason}`)
    if (interrupted) notice("info", "O turno em andamento foi interrompido")
    if (droppedWait) notice("info", "A espera por vaga na central foi descartada")
    centralLogger(doc.centralId, doc.taskCode).info(`Etapa definida manualmente: ${from} → ${target}`, { workbenchId: id, reason })

    if (target === "done") await completeManually({ ...loaded, doc }, reason, from)
    else {
        await update(doc, { stage: target, runState: "idle", error: null, pendingTurn: null, buildQueuedAt: null })
        pumpQueue(doc.centralId)
    }
    if (leftBuildQueue) pumpBuildQueue()
    return getWorkbench(id)
}

/** Alvos da limpeza na conclusão manual: só o que a mesa registrou (como na exclusão), inclusive o backup. */
async function manualCleanupTargets(loaded: Loaded): Promise<CleanupTargets> {
    const targets = cleanupTargets(loaded.config, loaded.doc)
    if (targets.teardownEnvironment && (await localPreviewTornDown(loaded))) return { ...targets, teardownEnvironment: false }
    return targets
}

function manualCleanupTurn(loaded: Loaded, targets: CleanupTargets): TurnPlan {
    return { stage: "finishing", text: cleanupPrompt(loaded.config, deletionContext(contextOf(loaded), targets), targets.backup, { preview: targets.teardownEnvironment, reason: "manual" }) }
}

/**
 * Conclusão sem PR: os mesmos efeitos do merge na tarefa (coluna "Ao concluir"), a limpeza do que a
 * mesa registrou (inclusive o backup do MongoDB, conferido antes de concluir) e a mesma conclusão
 * (`completeWorkbench`: sessão excluída, forks, fila). Sem nada a limpar — ou se a limpeza não puder
 * começar e não houver backup —, conclui na hora.
 */
async function completeManually(loaded: Loaded, reason: string, fromStage: WorkbenchStage): Promise<void> {
    const id = String(loaded.doc._id)
    const notice = (level: "info" | "warn", message: string) => publishWorkbenchEvent(id, { type: "notice", level, message })
    const manualCompletion = { reason, fromStage, at: new Date() }
    await update(loaded.doc, { manualCompletion, runState: "idle", error: null, pendingTurn: null, buildQueuedAt: null })
    const ready: Loaded = { ...loaded, doc: { ...loaded.doc, manualCompletion, runState: "idle", error: null, pendingTurn: null, buildQueuedAt: null } }
    const pr = ready.doc.pr
    await applyDoneEffects(ready)
    if (pr?.state === "open") notice("warn", `O PR #${pr.number} continua aberto no GitHub: o acompanhamento automático dele foi encerrado.`)
    const targets = await manualCleanupTargets(ready)
    if (hasCleanupWork(targets)) {
        try {
            await launchTurn(ready, manualCleanupTurn(ready, targets), { userText: "Conclusão manual: limpando o ambiente da mesa", bypassLimit: true })
            return
        } catch (error) {
            notice("warn", `Limpeza não iniciada: ${errorText(error)}`)
            // O backup da prévia (OPE-54) nunca fica para trás: sem a limpeza, a mesa não conclui.
            if (ready.doc.previewBackup) {
                await update(ready.doc, { stage: "finishing", runState: "failed", error: `Limpeza não iniciada: ${errorText(error)}`, lastStage: "finishing", lastPrompt: manualCleanupTurn(ready, targets) })
                return
            }
        }
    }
    await completeWorkbench(ready.doc)
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
    // Confere o estado da sessão ANTES de acompanhar: a resposta (200) já diz se há execução para
    // acompanhar (`attached`/`recovered`), se não há (`nothing`) ou se é falha transitória.
    // Build da prévia com o comando ainda no host: retoma a leitura (não há turno do agente para sondar).
    if (stage === "building" && doc.previewBuild?.job) {
        await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { reconnect: { outcome: "attached", message: "Retomando a leitura do build da prévia", at: new Date() } } })
        publishWorkbenchEvent(id, { type: "notice", level: "info", message: "Reconectando ao build da prévia em andamento…" })
        await launchTurn({ ...loaded, doc }, { stage, text: "", attach: true })
        return getWorkbench(id)
    }
    const startedAt = doc.turnStartedAt ? new Date(doc.turnStartedAt).getTime() : 0
    const probe = await probeReconnect(doc.sessionId, startedAt)
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { reconnect: { outcome: probe.outcome, message: probe.message, at: new Date() } } })
    if (!probe.follow) {
        await publishAgentic({ centralId: doc.centralId, workbenchId: id, taskId: doc.taskId })
        return getWorkbench(id)
    }
    publishWorkbenchEvent(id, { type: "notice", level: "info", message: "Reconectando à sessão do OpenCode sem reenviar a mensagem…" })
    centralLogger(doc.centralId, doc.taskCode).info("Reconectando à sessão do OpenCode", { workbenchId: id, stage })
    await launchTurn({ ...loaded, doc }, { stage, text: "", attach: true })
    return getWorkbench(id)
}

export async function retry(id: string): Promise<WorkbenchDto> {
    const loaded = await loadAll(id)
    const doc = await reconcile(loaded.doc)
    if (doc.deletionRequestedAt) {
        // Exclusão pendente: retoma a limpeza (a mesa sai ao concluir; nenhuma etapa anterior é reenviada).
        const deleted = await runDeletion(loaded, doc)
        return deleted ? toWorkbenchDto(doc) : getWorkbench(id)
    }
    assertAction(doc, "retry")
    const stage = asStage(doc.stage)
    if (!RUNNING_STAGES.includes(stage) || !doc.lastPrompt) throw new DomainError(409, "Não há etapa para tentar de novo", "WORKBENCH_INVALID_STATE")
    if (stage === "finishing" && doc.manualCompletion) {
        // Conclusão manual: refaz só a limpeza do que a mesa registrou (nunca caminhos inferidos).
        const ready = { ...loaded, doc }
        await launchTurn(ready, manualCleanupTurn(ready, await manualCleanupTargets(ready)), { userText: "Tentar a limpeza novamente", bypassLimit: true })
        return getWorkbench(id)
    }
    if (stage === "finishing") {
        // Limpeza falhou: refaz só a limpeza (o PR já foi mergeado e a tarefa movida).
        const preview = Boolean(doc.previewUrl) && !(await localPreviewTornDown(loaded))
        await launchTurn({ ...loaded, doc }, { stage, text: cleanupPrompt(loaded.config, contextOf(loaded), doc.previewBackup ?? null, { preview }) }, { userText: "Tentar a limpeza novamente" })
        return getWorkbench(id)
    }
    if (stage === "building") {
        if (doc.previewBuild?.method === "github") {
            const turn = await prepareBuildTurn({ ...loaded, doc }, "github")
            await launchTurn({ ...loaded, doc }, turn, { userText: "Tentar build remoto novamente" })
            return getWorkbench(id)
        }
        // O build não corre solto: volta para a fila global e o motor decide a vez (um build por vez).
        await update(doc, { stage: "build_queued", runState: "idle", error: null, buildQueuedAt: new Date() })
        pumpBuildQueue()
        return getWorkbench(id)
    }
    if (stage === "adversarial_review") {
        // Agente Adversário: refaz a rodada numa sessão nova (o texto guardado é a resposta do implementador).
        await launchTurn({ ...loaded, doc }, { stage, text: doc.lastPrompt.text }, { userText: "Tentar a revisão adversária novamente" })
        return getWorkbench(id)
    }
    const text = `A execução anterior desta etapa não terminou (${doc.error ?? "motivo desconhecido"}). Retome de onde parou e conclua a etapa conforme as instruções abaixo.\n\n${doc.lastPrompt.text}`
    // Os anexos da mensagem original voltam junto (o turno não terminou: o agente pode não tê-los lido).
    await launchTurn({ ...loaded, doc }, { stage, text, ...(doc.lastPrompt.fileIds?.length ? { fileIds: doc.lastPrompt.fileIds } : {}) }, { userText: "Tentar novamente" })
    return getWorkbench(id)
}

export async function interrupt(id: string): Promise<WorkbenchDto> {
    const doc = await loadWorkbench(id)
    if (doc.previewBuild?.method === "github" && doc.stage === "building") {
        const loaded = await loadAll(id)
        await invalidateRemotePreview(await getOpencodeClient(), doc, loaded.config.sessionDirectory)
    }
    // Registra a intenção ANTES de abortar: a interrupção pedida pelo usuário nunca dispara a
    // reconexão automática (ao contrário das perdas por queda/reinício).
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { stopRequestedAt: new Date() } })
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

/** Chat durante a execução: mensagem do usuário que entra no turno em andamento da mesa (sem interromper). */
export async function sendLiveMessage(id: string, text: string, fileIds?: string[]): Promise<WorkbenchDto> {
    const doc = await loadWorkbench(id)
    if (doc.deletionRequestedAt) throw new DomainError(409, "A mesa está sendo excluída: não é possível enviar mensagens", "WORKBENCH_DELETING")
    if (!isWorkbenchActive(id)) throw new DomainError(409, "O agente não está trabalhando nesta mesa: use as ações da etapa", "WORKBENCH_NOT_RUNNING")
    if (asStage(doc.stage) === "adversarial_review") throw new DomainError(409, "O agente adversário revisa sem interferência: aguarde o veredito para orientar a correção", "WORKBENCH_ADVERSARIAL_REVIEW")
    const files = await loadClaimableFiles(fileIds, id)
    const attachments = files.length ? await liveAttachments(files, agenticDownloadDir(doc.taskCode)) : undefined
    await deliverLiveMessage({ runId: id, centralId: doc.centralId, label: "a mesa", audit: { entidade: AGENTIC_AUDIT_WORKBENCH, contexto: { tarefa: doc.taskCode, etapa: asStage(doc.stage) } } }, text, attachments)
    // Agente Mentor: avalia a mensagem ao fim do turno em andamento.
    const adversary = await adversaryModule()
    adversary.mentorRecordLiveMessage(id, text)
    await claimAgenticFiles(files, { workbenchId: id })
    centralLogger(doc.centralId, doc.taskCode).step("Mensagem do usuário entregue ao turno em andamento", { workbenchId: id })
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

// ---------------------------------------------------------------------------
// Exclusão da mesa (com a mesma limpeza de ambiente da conclusão — OPE-68)
// ---------------------------------------------------------------------------

const DELETE_IDLE_TIMEOUT_MS = 30_000

/** Espera o turno vivo desta mesa soltar o processo antes de iniciar a limpeza de exclusão. */
async function waitWorkbenchIdle(id: string, timeoutMs = DELETE_IDLE_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (isWorkbenchActive(id)) {
        if (Date.now() >= deadline) throw new DomainError(409, "A execução em andamento não terminou a tempo de iniciar a limpeza da exclusão", "WORKBENCH_BUSY")
        await new Promise((resolve) => setTimeout(resolve, 200))
    }
}

/**
 * Exclui no OpenCode a sessão atual e as pendentes da mesa. A sessão é desvinculada e registrada
 * como pendência ANTES da chamada: se a exclusão falhar (OpenCode fora do ar), a referência fica
 * gravada e a retomada não perde a sessão.
 */
async function removeWorkbenchSessions(doc: IAgenticWorkbench): Promise<void> {
    const sessions = [...new Set([...(doc.pendingSessionDeletions ?? []), ...(doc.sessionId ? [doc.sessionId] : [])])].filter((value): value is string => Boolean(value))
    if (!sessions.length) return
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { sessionId: null, sessionDirectory: null, pendingSessionDeletions: sessions } })
    if (!(await flushPendingSessionDeletions({ _id: doc._id, pendingSessionDeletions: sessions }))) {
        throw new Error("O OpenCode não confirmou a exclusão da sessão da mesa; tente novamente quando o serviço estiver disponível")
    }
}

/** Confere, na máquina do OpenCode, que a limpeza removeu de fato os recursos que a mesa criou. */
async function assertCleanupDone(client: OpencodeClient, targets: CleanupTargets, ctx: WorkbenchContext): Promise<void> {
    for (const command of cleanupVerificationCommands(targets, ctx.composeProject)) {
        const result = await runOpencodeShell(client, ctx.sessionDirectory, command, { timeoutMs: 15_000 })
        if (result.exitCode !== 0) throw new Error(`A limpeza não confirmou a remoção de um recurso da mesa (${command}); verifique o ambiente e tente novamente`)
    }
}

/** Apaga o registro da mesa e libera tudo o que ela segurava (porta, saída e filas). */
async function finalizeDeletion(doc: IAgenticWorkbench): Promise<void> {
    const id = String(doc._id)
    await (await forksModule()).deleteWorkbenchForks(id)
    const current = await loadWorkbench(id)
    await removeWorkbenchSessions(current)
    // Sessões que rodadas do Agente Adversário ainda seguram (melhor esforço; o histórico fica).
    await (await adversaryModule()).removeWorkbenchReviewSessions(id).catch((error: unknown) => centralLogger(doc.centralId, doc.taskCode).warn("Falha ao excluir sessões do agente adversário", { workbenchId: id, error: errorText(error) }))
    await releasePreviewPort(id)
    await dropWorkbenchEvents(id)
    await trackBuild(id, () => dropBuilds(id))
    // Anexos das mensagens da mesa e dos forks (melhor esforço: falha no storage não segura a exclusão).
    await deleteWorkbenchFiles(id).catch((error) => logger.warn({ err: error, workbenchId: id }, "[agentic] Falha ao remover os anexos da mesa"))
    await AgenticWorkbench.deleteOne({ _id: doc._id })
    await syncWorkbenchTimer(id)
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { tarefa: doc.taskCode, etapa: doc.stage, limpezaAmbiente: Boolean(doc.deletionRequestedAt) } })
    centralLogger(doc.centralId, doc.taskCode).warn("Mesa de trabalho excluída", { workbenchId: id, limpezaAmbiente: Boolean(doc.deletionRequestedAt) })
    await publishAgentic({ centralId: doc.centralId, workbenchId: id, taskId: doc.taskId })
    pumpQueue(doc.centralId)
    pumpBuildQueue()
}

/**
 * Inicia (ou retoma) a exclusão: marca a intenção, interrompe o turno vivo, invalida a prévia
 * remota e roda a MESMA limpeza de ambiente da conclusão antes de remover o registro. Devolve
 * `true` quando a mesa já foi removida; `false` quando a limpeza ficou em andamento (a mesa sai no
 * fim do turno de limpeza, em `afterTurn`).
 */
async function runDeletion(loaded: Loaded, loadedDoc: IAgenticWorkbench): Promise<boolean> {
    const id = String(loadedDoc._id)
    let doc = loadedDoc
    // A intenção é gravada ANTES de qualquer operação externa: a retomada (retry/reinício) a mantém.
    if (!doc.deletionRequestedAt) {
        const requestedAt = new Date()
        await update(doc, { deletionRequestedAt: requestedAt, stage: "finishing", runState: "idle", error: null, buildQueuedAt: null, pendingTurn: null })
        doc = { ...doc, deletionRequestedAt: requestedAt, stage: "finishing", runState: "idle", buildQueuedAt: null, pendingTurn: null }
    }
    if (doc.previewBuild?.method === "github") {
        // Melhor esforço: sem OpenCode não há como invalidar a tentativa remota (a limpeza falha e a mesa fica).
        try {
            await invalidateRemotePreview(await getOpencodeClient(), doc, loaded.config.sessionDirectory)
        } catch {
            // ignora: a tentativa remota é reinvalidada na retomada
        }
    }
    if (isWorkbenchActive(id)) {
        if (doc.sessionId) {
            try {
                await (await getOpencodeClient()).session.interrupt({ sessionID: doc.sessionId })
            } catch {
                // sem OpenCode, o abort local abaixo já encerra o acompanhamento
            }
        }
        abortWorkbenchRun(id, "Mesa excluída")
        await waitWorkbenchIdle(id)
    }
    let targets = cleanupTargets(loaded.config, doc)
    if (targets.teardownEnvironment && (await localPreviewTornDown({ ...loaded, doc }))) targets = { ...targets, teardownEnvironment: false }
    if (!hasCleanupWork(targets)) {
        await removeWorkbenchSessions(doc)
        await finalizeDeletion(doc)
        return true
    }
    await launchTurn(
        { ...loaded, doc },
        { stage: "finishing", text: cleanupPrompt(loaded.config, deletionContext(contextOf(loaded), targets), targets.backup, { preview: targets.teardownEnvironment, reason: "deletion" }) },
        { userText: "Exclusão da mesa: limpando o ambiente antes de remover", bypassLimit: true },
    )
    return false
}

/**
 * DELETE /api/agentic/workbenches/[id] — exclui a mesa. Antes de apagar o registro roda a MESMA
 * limpeza de ambiente da conclusão (OPE-68), respeitando as opções da central, e exclui a sessão do
 * OpenCode. Devolve `{ deleted }`: `false` = a limpeza ficou em andamento (a mesa sai depois).
 */
export async function deleteWorkbench(id: string): Promise<{ deleted: boolean }> {
    const loaded = await loadAll(id)
    const doc = loaded.doc
    // Concluída: a limpeza da conclusão já rodou; só apaga o registro (sessões: melhor esforço).
    if (asStage(doc.stage) === "done") {
        await flushPendingSessionDeletions(doc).catch(() => undefined)
        await finalizeDeletion(doc)
        return { deleted: true }
    }
    try {
        return { deleted: await runDeletion(loaded, doc) }
    } catch (error) {
        const message = errorText(error)
        // A exclusão continua agendada: a mesa fica com "Tentar novamente" em vez de sumir sem limpar.
        await update(doc, { deletionRequestedAt: doc.deletionRequestedAt ?? new Date(), stage: "finishing", runState: "failed", error: `A limpeza da exclusão não pôde concluir: ${message}` }).catch(() => undefined)
        throw new DomainError(409, `Não foi possível limpar o ambiente da mesa agora (${message}). A exclusão segue pendente — use Tentar novamente na mesa.`, "WORKBENCH_DELETION_FAILED")
    }
}

// ---------------------------------------------------------------------------
// Acompanhamento do PR (rotina agendada)
// ---------------------------------------------------------------------------

/** Pedido de mudança no PR (comentário com `@opex` ou revisão): com o motivo, replaneja sozinho; sem, pede o texto ao usuário. */
export async function handlePrFeedback(id: string, feedback: string): Promise<void> {
    const loaded = await loadAll(id)
    if (loaded.doc.deletionRequestedAt) return
    await prepareHub(id)
    if (!feedback.trim()) {
        publishWorkbenchEvent(id, { type: "notice", level: "warn", message: "O PR pediu mudanças sem dizer o motivo: descreva o que precisa mudar" })
        await update(loaded.doc, { stage: "changes_requested", runState: "idle" })
        return
    }
    try {
        // Com o limite cheio, o replanejamento aguarda vaga (a mesa segue em PR aberto até lá).
        await launchOrQueue(loaded, "pr-feedback", { stage: "planning", text: prChangesPrompt(loaded.config, loaded.doc.pr?.url ?? "PR", feedback) }, { userText: `Pedido de mudança no PR:\n\n${feedback}`, feedback })
    } catch (error) {
        // Sem como replanejar agora (ex.: OpenCode indisponível): guarda o pedido para o usuário reenviar.
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
    // Mesa em exclusão: o PR não a reativa.
    if (doc.deletionRequestedAt) return false
    // Só age na mesa aberta e ociosa do mesmo PR aberto (nunca em cima de outra execução em andamento).
    if (asStage(doc.stage) !== "pr_open" || !pr || pr.state !== "open") return false
    if (isWorkbenchActive(id) || asRunState(doc.runState) === "running" || doc.pendingTurn) return false
    await prepareHub(id)
    try {
        // Os SHAs tratados são gravados só quando o turno começa (na espera por vaga, ao ganhar a vaga).
        const started = await launchOrQueue(
            loaded,
            "pr-conflict",
            { stage: "resolving_conflicts", text: conflictPrompt(config, contextOf(loaded), { number: pr.number, url: pr.url, baseBranch: info.baseBranch, headBranch: info.headBranch }) },
            { userText: `Conflito de merge no PR #${pr.number}: resolvendo automaticamente contra ${info.baseBranch}.`, extraSet: { "pr.conflictBaseSha": info.baseSha, "pr.conflictHeadSha": info.headSha } },
        )
        if (started) centralLogger(doc.centralId, doc.taskCode).warn(`PR #${pr.number}: conflito de merge — resolução automática iniciada`, { workbenchId: id })
        return true
    } catch (error) {
        // Sem como resolver agora (OpenCode indisponível, limite de mesas…): mantém elegível à próxima varredura.
        publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `O PR #${pr.number} está com conflito de merge, mas a resolução não pôde começar (${errorText(error)}).` })
        return false
    }
}

/**
 * CI falho no PR (todas as verificações terminadas): aciona o agente para corrigir a branch do PR e
 * fazer push — ou reexecutar a falha de infraestrutura — sem nova aprovação. Grava as falhas tratadas
 * (`pr.ciFixKey`) e a contagem de tentativas ao iniciar o turno (na espera por vaga, ao ganhar a
 * vaga); falha ao iniciar mantém a mesa elegível à próxima varredura.
 */
export async function handlePrCiFailure(id: string, info: { headBranch: string; headSha: string; failures: CiFailure[]; key: string; rerunAllowed: boolean; attempt: number }): Promise<boolean> {
    const loaded = await loadAll(id)
    const { doc, config } = loaded
    const pr = doc.pr
    if (!loaded.ci.fixCi || doc.deletionRequestedAt) return false
    if (asStage(doc.stage) !== "pr_open" || !pr || pr.state !== "open") return false
    if (isWorkbenchActive(id) || asRunState(doc.runState) === "running" || doc.pendingTurn) return false
    await prepareHub(id)
    const names = info.failures.map((failure) => failure.name).join(", ")
    try {
        const started = await launchOrQueue(
            loaded,
            "pr-ci-fix",
            { stage: "fixing_ci", text: ciFixPrompt(config, contextOf(loaded), { number: pr.number, url: pr.url, headBranch: info.headBranch, headSha: info.headSha, rerunAllowed: info.rerunAllowed }, info.failures) },
            {
                userText: `CI falhou no PR #${pr.number} (${names}): corrigindo automaticamente.`,
                extraSet: { "pr.ciFixKey": info.key, "pr.ciFixHeadSha": info.headSha, "pr.ciFixAttempts": info.attempt, "pr.ciFixLimitNotified": false },
            },
        )
        if (started) centralLogger(doc.centralId, doc.taskCode).warn(`PR #${pr.number}: CI falhou (${names}) — correção automática iniciada`, { workbenchId: id })
        await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: doc.taskCode, pr: pr.url, ciFalhou: names, tentativa: info.attempt } })
        return true
    } catch (error) {
        publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `O CI do PR #${pr.number} falhou, mas a correção não pôde começar (${errorText(error)}).` })
        return false
    }
}

/** Limite de correções de CI seguidas atingido: avisa uma vez (a mesa segue acompanhando o PR). */
export async function handlePrCiLimit(id: string, { max }: { max: number }): Promise<void> {
    const doc = await loadWorkbench(id)
    if (doc.deletionRequestedAt || !doc.pr) return
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `O CI do PR #${doc.pr.number} continua falhando e o limite de ${max} correção(ões) automática(s) foi atingido: corrija manualmente ou comente no PR com @opex para replanejar.` })
    centralLogger(doc.centralId, doc.taskCode).warn(`PR #${doc.pr.number}: limite de correções de CI atingido`, { workbenchId: id })
    await savePrCursors(id, { ciFixLimitNotified: true })
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
    await update(doc, { pr })
    publishWorkbenchEvent(id, { type: "notice", level: "success", message: `PR #${pr.number} mergeado` })

    await applyDoneEffects(loaded)
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_WORKBENCH, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: doc.taskCode, prMergeado: pr.url } })

    const cleanup = config.cleanup
    // O backup da prévia (OPE-54) exige a etapa de limpeza mesmo com toda a limpeza de ambiente desligada.
    if (cleanup.teardownEnvironment || cleanup.removeWorktree || cleanup.deleteBranch || doc.previewBackup) {
        // Sem prévia (fluxo PR automático) não há ambiente a derrubar.
        const preview = Boolean(doc.previewUrl) && !(await localPreviewTornDown(loaded))
        return { stage: "finishing", text: cleanupPrompt(config, contextOf(loaded), doc.previewBackup ?? null, { preview }) }
    }
    return null
}

/**
 * Efeitos da conclusão na tarefa (merge ou conclusão manual, mesmo resultado): move para a coluna
 * "Ao concluir" da central. Melhor esforço: falhas viram aviso na mesa.
 */
async function applyDoneEffects(loaded: Loaded): Promise<void> {
    const { doc } = loaded
    const id = String(doc._id)
    const doneColumn = loaded.columns.onDone
    if (!doneColumn) return
    try {
        await moveTask(doc.taskId, { targetColumn: doneColumn }, actorId())
        publishWorkbenchEvent(id, { type: "notice", level: "info", message: "Tarefa movida para a coluna de conclusão" })
    } catch (error) {
        publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `Não foi possível mover a tarefa: ${errorText(error)}` })
        centralLogger(doc.centralId, doc.taskCode).warn("Falha ao mover a tarefa na conclusão", { workbenchId: id, error: errorText(error) })
    }
}

/** PR mergeado: tarefa para Validação, timer parado e limpeza (conforme a central). */
export async function handlePrMerged(id: string, merge: { mergedAt: Date; mergeCommitSha: string | null }): Promise<void> {
    const loaded = await loadAll(id)
    const { doc } = loaded
    if (doc.deletionRequestedAt) return
    await prepareHub(id)
    if (doc.pendingTurn) {
        // O merge encerra o que a mesa aguardava (replanejar, resolver conflito, mergear…).
        await update(doc, { pendingTurn: null })
        publishWorkbenchEvent(id, { type: "notice", level: "info", message: "O PR foi mergeado: a espera por vaga foi descartada." })
    }
    const pr: IWorkbenchPr = { ...doc.pr!, state: "merged", mergedAt: merge.mergedAt, mergeCommitSha: merge.mergeCommitSha }
    const next = await afterMerge(loaded, pr)
    if (next) {
        try {
            // Com o limite cheio, a limpeza aguarda vaga (a mesa segue em PR aberto, já mergeado).
            await launchOrQueue({ ...loaded, doc: { ...doc, pr, pendingTurn: null } }, "pr-cleanup", next)
            return
        } catch (error) {
            publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `Limpeza não iniciada: ${errorText(error)}` })
            // Com backup pendente a mesa NÃO conclui sem a limpeza: fica em "finishing" para Tentar novamente.
            if (doc.previewBackup) {
                await update(doc, { stage: "finishing", runState: "failed", error: `A limpeza não pôde começar: ${errorText(error)}` })
                return
            }
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
    // Mesa em exclusão: não mergeia nem reabre fluxo.
    if (doc.deletionRequestedAt) return false
    // Só age na mesa aberta e ociosa acompanhando o PR (nunca em cima de outra execução em andamento).
    if (asStage(doc.stage) !== "pr_open" || !pr || pr.state !== "open") return false
    if (isWorkbenchActive(id) || asRunState(doc.runState) === "running" || doc.pendingTurn) return false
    if (!doc.branch) return false
    await prepareHub(id)
    try {
        const started = await launchOrQueue(
            loaded,
            "pr-auto-merge",
            { stage: "merging_pr", text: mergePrPrompt(config, contextOf(loaded), { number: pr.number, url: pr.url, baseBranch: info.baseBranch }) },
            { userText: `Merge automático habilitado na central: mergeando o PR #${pr.number}.` },
        )
        if (started) centralLogger(doc.centralId, doc.taskCode).info(`PR #${pr.number}: merge automático iniciado`, { workbenchId: id })
        return true
    } catch (error) {
        publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `O merge automático do PR #${pr.number} não pôde começar (${errorText(error)}).` })
        return false
    }
}

/** PR fechado sem merge: avisa uma vez (a mesa continua aberta para decidir o que fazer). */
export async function handlePrClosed(id: string): Promise<void> {
    const doc = await loadWorkbench(id)
    if (doc.deletionRequestedAt || !doc.pr || doc.pr.closedNotified) return
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "notice", level: "warn", message: `O PR #${doc.pr.number} foi fechado sem merge. Reabra o PR no GitHub ou exclua a mesa.` })
    await update(doc, { pr: { ...doc.pr, state: "closed", closedNotified: true } })
}

export async function handlePrReopened(id: string): Promise<void> {
    const doc = await loadWorkbench(id)
    if (doc.deletionRequestedAt || !doc.pr || doc.pr.state === "open") return
    await update(doc, { pr: { ...doc.pr, state: "open", closedNotified: false } })
}

/** Grava os cursores de acompanhamento do PR (maior id de revisão e de comentário já tratados). */
export async function savePrCursors(id: string, cursors: { lastReviewId?: number; lastCommentId?: number; autoReviewReplans?: number; ciFixAttempts?: number; ciFixLimitNotified?: boolean }): Promise<void> {
    const set: Record<string, number | boolean> = {}
    if (cursors.ciFixAttempts !== undefined) set["pr.ciFixAttempts"] = cursors.ciFixAttempts
    if (cursors.ciFixLimitNotified !== undefined) set["pr.ciFixLimitNotified"] = cursors.ciFixLimitNotified
    if (cursors.lastReviewId !== undefined) set["pr.lastReviewId"] = cursors.lastReviewId
    if (cursors.lastCommentId !== undefined) set["pr.lastCommentId"] = cursors.lastCommentId
    if (cursors.autoReviewReplans !== undefined) set["pr.autoReviewReplans"] = cursors.autoReviewReplans
    if (Object.keys(set).length) await AgenticWorkbench.updateOne({ _id: id }, { $set: set })
}

