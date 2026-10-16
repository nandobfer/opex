import { isValidObjectId } from "mongoose"
import { isSessionNotFoundError } from "@opencode/client"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AgenticFork, AgenticWorkbench, type IAgenticFork, type IAgenticWorkbench } from "@/lib/db/models/Agentic"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import type { OpencodeFormDto, OpencodePermissionDto } from "@/lib/ai/opencode-events"
import { runAgentTurn } from "@/lib/ai/opencode-run"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import {
    AGENTIC_AUDIT_FORK,
    FORK_CHILD_NOTES_INSTRUCTIONS_KEY,
    FORK_INSTRUCTIONS_KEY,
    FORK_INTEGRATION_TARGET_LABELS,
    FORK_READONLY_PERMISSIONS,
    FORK_STATUSES,
    OPEN_FORK_STATUSES,
    WORKBENCH_STAGE_LABELS,
    type ForkDonePolicy,
    type ForkIntegrationTarget,
    type ForkStatus,
} from "../constants"
import {
    canOpenChildFork,
    canRunFork,
    extractForkSummary,
    forkFirstPrompt,
    forkFreshContextPrompt,
    forkInstructions,
    forkIntegratePrompt,
    forkIntegrationTargets,
    forkNotesInstructions,
    forkPlannerFeedback,
    forkRetryPrompt,
    forkReviseSummaryPrompt,
    plannerActionFor,
    type ForkAction,
    type ForkParentView,
} from "../fork-logic"
import { resolveAgent } from "../logic"
import { branchNameFor, composeProjectFor, worktreePathFor, type WorkbenchContext } from "../prompts"
import type { CentralConfig, FormReplyInput, PermissionReplyInput } from "../schemas"
import type { ForkDto, WorkbenchDto, WorkbenchEventPayload } from "../types"
import { loadCentral, publishAgentic, repoForProject } from "./centrals"
import { asRunState, asStage } from "./dto"
import { applyForkNotes } from "./fork-notes"
import { abortWorkbenchRun, clearWorkbenchActive, dropWorkbenchEvents, flushWorkbenchEvents, isWorkbenchActive, markWorkbenchActive, prepareHub, publishWorkbenchEvent } from "./hub"
import { deleteWorkbenchSession } from "./session-cleanup"
import { agenticAvailability, loadAgenticSettings } from "./settings"
import { getWorkbench, reopen, requestCorrection, revisePlan, submitPrFeedback } from "./workflow"

/**
 * Forks da conversa (SOMENTE servidor): conversas paralelas de uma mesa, somente leitura, numa
 * sessão própria do OpenCode — cópia da sessão principal (`session.fork`) ou, sem ela (mesa
 * concluída), uma sessão nova com o contexto da mesa. Encerrado, o fork pode ser retomado,
 * descartado (some por completo) ou integrado: o agente consolida um resumo, o usuário ajusta até
 * fechar o escopo e escolhe o destino (contexto da conversa principal, planejador ou reabertura).
 *
 * A saída usa o MESMO barramento das mesas (`agentic_events`, chaveado pelo id do fork). As sessões
 * descartadas/finalizadas entram nas exclusões pendentes da MESA (`pendingSessionDeletions`), que a
 * rotina `agentic-queue-pump` retoma.
 */

const log = loggerFor({ module: "agentic-fork" })
const TURN_TIMEOUT_MS = 3 * 60 * 60_000

const actorId = () => getLocalUser().id
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

const asForkStatus = (value: string): ForkStatus => ((FORK_STATUSES as readonly string[]).includes(value) ? (value as ForkStatus) : "closed")

function assertIds(workbenchId: string, forkId?: string): void {
    if (!isValidObjectId(workbenchId)) throw new DomainError(404, "Mesa de trabalho não encontrada", "WORKBENCH_NOT_FOUND")
    if (forkId !== undefined && !isValidObjectId(forkId)) throw new DomainError(404, "Fork não encontrado", "FORK_NOT_FOUND")
}

async function loadWorkbenchDoc(workbenchId: string): Promise<IAgenticWorkbench> {
    assertIds(workbenchId)
    await dbConnect()
    const doc = await AgenticWorkbench.findById(workbenchId).lean()
    if (!doc) throw new DomainError(404, "Mesa de trabalho não encontrada", "WORKBENCH_NOT_FOUND")
    return doc as unknown as IAgenticWorkbench
}

async function loadFork(workbenchId: string, forkId: string): Promise<IAgenticFork> {
    assertIds(workbenchId, forkId)
    await dbConnect()
    const doc = (await AgenticFork.findById(forkId).lean()) as unknown as IAgenticFork | null
    if (!doc || doc.workbenchId !== workbenchId) throw new DomainError(404, "Fork não encontrado", "FORK_NOT_FOUND")
    return reconcile(doc)
}

/** Fork "executando" sem turno vivo neste processo (o app reiniciou): vira interrompido. */
async function reconcile(doc: IAgenticFork): Promise<IAgenticFork> {
    if (doc.runState !== "running" || isWorkbenchActive(String(doc._id))) return doc
    const error = "A execução foi perdida (o app reiniciou durante o turno). Use Tentar novamente."
    await AgenticFork.updateOne({ _id: doc._id, runState: "running" }, { $set: { runState: "interrupted", error, pendingForms: [], pendingPermissions: [] } })
    return { ...doc, runState: "interrupted", error, pendingForms: [], pendingPermissions: [] }
}

function toForkDto(doc: IAgenticFork): ForkDto {
    const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null)
    return {
        id: String(doc._id),
        workbenchId: doc.workbenchId,
        number: doc.number,
        parentForkId: doc.parentForkId ?? null,
        parentNumber: doc.parentNumber ?? null,
        status: asForkStatus(doc.status),
        runState: asRunState(doc.runState),
        error: doc.error ?? null,
        origin: doc.origin === "fresh" ? "fresh" : "fork",
        forkedFromStage: asStage(doc.forkedFromStage),
        summary: doc.summary ?? null,
        integration: doc.integration ? { target: doc.integration.target as ForkIntegrationTarget, summary: doc.integration.summary, appliedAt: new Date(doc.integration.appliedAt).toISOString() } : null,
        pendingPermissions: (doc.pendingPermissions ?? []) as OpencodePermissionDto[],
        pendingForms: (doc.pendingForms ?? []) as OpencodeFormDto[],
        usage: { costUsd: doc.usage?.costUsd ?? 0, inputTokens: doc.usage?.inputTokens ?? 0, outputTokens: doc.usage?.outputTokens ?? 0, reasoningTokens: doc.usage?.reasoningTokens ?? 0 },
        createdAt: iso(doc.createdAt) ?? new Date().toISOString(),
        updatedAt: iso(doc.updatedAt) ?? new Date().toISOString(),
        closedAt: iso(doc.closedAt),
    }
}

async function publishFork(doc: Pick<IAgenticFork, "_id" | "workbenchId" | "centralId" | "taskId">): Promise<void> {
    await publishAgentic({ centralId: doc.centralId, workbenchId: doc.workbenchId, taskId: doc.taskId, forkId: String(doc._id) })
}

function notice(forkId: string, level: "info" | "warn" | "error" | "success", message: string): void {
    publishWorkbenchEvent(forkId, { type: "notice", level, message })
}

function assertForkAction(doc: IAgenticFork, action: ForkAction): void {
    const runState = isWorkbenchActive(String(doc._id)) ? "running" : asRunState(doc.runState)
    if (!canRunFork(asForkStatus(doc.status), runState, action, Boolean(doc.summary))) {
        const detail = runState === "running" ? " (o agente está respondendo)" : ""
        throw new DomainError(409, `Ação indisponível no fork ${doc.number} (${asForkStatus(doc.status) === "active" ? "ativo" : asForkStatus(doc.status)})${detail}`, "FORK_INVALID_STATE")
    }
}

/** Feature/OpenCode disponíveis e central ativa (o fork não ocupa vaga no limite de mesas). */
async function assertForkReady(config: CentralConfig): Promise<void> {
    const { settings } = await loadAgenticSettings()
    const availability = await agenticAvailability(settings)
    if (!availability.available) throw new DomainError(409, availability.reason ?? "Desenvolvimento agêntico indisponível", "AGENTIC_UNAVAILABLE")
    if (!config.enabled) throw new DomainError(409, "A central está desativada em Integrações › Provedores de IA", "CENTRAL_DISABLED")
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export async function listForks(workbenchId: string): Promise<ForkDto[]> {
    await loadWorkbenchDoc(workbenchId)
    const docs = (await AgenticFork.find({ workbenchId }).sort({ number: 1 }).lean()) as unknown as IAgenticFork[]
    return Promise.all(docs.map(async (doc) => toForkDto(await reconcile(doc))))
}

export async function getFork(workbenchId: string, forkId: string): Promise<ForkDto> {
    return toForkDto(await loadFork(workbenchId, forkId))
}

/** Confere que o fork existe (stream de eventos: 404 antes de abrir). */
export async function assertForkExists(workbenchId: string, forkId: string): Promise<void> {
    await loadFork(workbenchId, forkId)
}

// ---------------------------------------------------------------------------
// Sessão e turnos
// ---------------------------------------------------------------------------

interface ForkSession {
    sessionId: string
    directory: string
    origin: "fork" | "fresh"
}

/** Sessão do fork: cópia da sessão principal ou, sem ela, uma sessão nova no diretório da central. */
async function createForkSession(client: OpencodeClient, workbench: IAgenticWorkbench, config: CentralConfig, number: number): Promise<ForkSession> {
    const title = `${workbench.taskCode} · Fork ${number}: ${workbench.taskTitle}`.slice(0, 120)
    if (workbench.sessionId) {
        try {
            const info = await client.session.fork({ sessionID: workbench.sessionId })
            await client.session.update({ sessionID: info.id, title, metadata: { app: "opex", taskId: workbench.taskId, kind: "fork" } }).catch(() => undefined)
            return { sessionId: info.id, directory: info.location?.directory ?? workbench.sessionDirectory ?? config.sessionDirectory, origin: "fork" }
        } catch (error) {
            if (!isSessionNotFoundError(error)) throw new DomainError(502, `Não foi possível criar o fork da conversa: ${errorText(error)}`, "FORK_FAILED")
            log.warn({ workbenchId: String(workbench._id) }, "[agentic-fork] sessão principal inexistente no OpenCode; abrindo uma sessão nova com o contexto da mesa")
        }
    }
    const directory = config.sessionDirectory
    const session = await client.session.create({ title, location: { directory }, metadata: { app: "opex", taskId: workbench.taskId, kind: "fork" }, permissions: [...FORK_READONLY_PERMISSIONS] })
    return { sessionId: session.id, directory: session.location?.directory ?? directory, origin: "fresh" }
}

/** Sessão de um fork de fork: cópia da sessão do fork pai até aqui (sem cair para sessão nova). */
async function createChildForkSession(client: OpencodeClient, workbench: IAgenticWorkbench, parent: IAgenticFork, number: number): Promise<ForkSession> {
    const title = `${workbench.taskCode} · Fork ${number} (de Fork ${parent.number}): ${workbench.taskTitle}`.slice(0, 120)
    try {
        const info = await client.session.fork({ sessionID: parent.sessionId! })
        await client.session.update({ sessionID: info.id, title, metadata: { app: "opex", taskId: workbench.taskId, kind: "fork" } }).catch(() => undefined)
        return { sessionId: info.id, directory: info.location?.directory ?? parent.sessionDirectory ?? workbench.sessionDirectory ?? "", origin: "fork" }
    } catch (error) {
        if (isSessionNotFoundError(error)) throw new DomainError(409, `A conversa do Fork ${parent.number} não existe mais no OpenCode: não é possível abrir um fork a partir dele`, "FORK_PARENT_SESSION_MISSING")
        throw new DomainError(502, `Não foi possível criar o fork do Fork ${parent.number}: ${errorText(error)}`, "FORK_FAILED")
    }
}

/** Fork pai em aberto e com sessão (abrir um fork a partir dele). */
async function loadParentFork(workbenchId: string, parentForkId: string): Promise<IAgenticFork> {
    const parent = await loadFork(workbenchId, parentForkId)
    if (!canOpenChildFork(asForkStatus(parent.status))) throw new DomainError(409, `O Fork ${parent.number} não está mais em aberto: não é possível abrir um fork a partir dele`, "FORK_INVALID_STATE")
    if (!parent.sessionId) throw new DomainError(409, `O Fork ${parent.number} não tem mais uma conversa no OpenCode`, "FORK_PARENT_SESSION_MISSING")
    return parent
}

/** Fork pai visto pelo filho (destino "Fork pai"); `status: null` = pai descartado. */
async function parentView(fork: IAgenticFork): Promise<ForkParentView | null> {
    if (!fork.parentForkId) return null
    const parent = (await AgenticFork.findById(fork.parentForkId).select({ status: 1, number: 1 }).lean()) as unknown as Pick<IAgenticFork, "status" | "number"> | null
    return { number: parent?.number ?? fork.parentNumber ?? 0, status: parent ? asForkStatus(parent.status) : null }
}

/** Grava os resumos dos filhos como instrução durável da sessão do fork; `false` = vão no próximo prompt. */
async function applyChildNotes(client: OpencodeClient, fork: Pick<IAgenticFork, "_id" | "childNotes" | "sessionId">): Promise<boolean> {
    const notes = fork.childNotes ?? []
    if (!notes.length || !fork.sessionId) return true
    try {
        await client.session.instructions.entry.put({ sessionID: fork.sessionId, key: FORK_CHILD_NOTES_INSTRUCTIONS_KEY, value: forkNotesInstructions(notes, "fork") })
        await AgenticFork.updateOne({ _id: fork._id }, { $set: { childNotesSynced: true } })
        return true
    } catch (error) {
        log.warn({ err: errorText(error), forkId: String(fork._id) }, "[agentic-fork] não foi possível aplicar os resumos dos forks filhos à sessão; vão no próximo prompt")
        await AgenticFork.updateOne({ _id: fork._id }, { $set: { childNotesSynced: false } })
        return false
    }
}

/** Restringe a sessão a somente leitura; `false` quando o servidor recusa (o protocolo ainda proíbe alterações). */
async function restrictSession(client: OpencodeClient, sessionId: string): Promise<boolean> {
    try {
        await client.session.update({ sessionID: sessionId, permissions: [...FORK_READONLY_PERMISSIONS] })
        return true
    } catch (error) {
        log.warn({ err: errorText(error), sessionId }, "[agentic-fork] não foi possível restringir as permissões da sessão")
        return false
    }
}

/** Protocolo do fork como entrada durável da sessão; `false` = vai no primeiro prompt. */
async function applyProtocol(client: OpencodeClient, sessionId: string, instructions: string): Promise<boolean> {
    try {
        await client.session.instructions.entry.put({ sessionID: sessionId, key: FORK_INSTRUCTIONS_KEY, value: instructions })
        return true
    } catch (error) {
        log.warn({ err: errorText(error), sessionId }, "[agentic-fork] não foi possível aplicar o protocolo à sessão; vai no prompt")
        return false
    }
}

function turnHooks(doc: IAgenticFork) {
    const filter = { _id: doc._id }
    const changed = () => publishFork(doc)
    return {
        onPermission: async (permission: OpencodePermissionDto) => {
            await AgenticFork.updateOne(filter, { $pull: { pendingPermissions: { id: permission.id } } })
            await AgenticFork.updateOne(filter, { $push: { pendingPermissions: permission } })
            await changed()
        },
        onPermissionClosed: async (requestId: string) => {
            await AgenticFork.updateOne(filter, { $pull: { pendingPermissions: { id: requestId } } })
            await changed()
        },
        onForm: async (form: OpencodeFormDto) => {
            await AgenticFork.updateOne(filter, { $pull: { pendingForms: { id: form.id } } })
            await AgenticFork.updateOne(filter, { $push: { pendingForms: form } })
            await changed()
        },
        onFormClosed: async (formId: string) => {
            await AgenticFork.updateOne(filter, { $pull: { pendingForms: { id: formId } } })
            await changed()
        },
        onStep: async ({ costUsd, tokens }: { costUsd: number; tokens: { input: number; output: number; reasoning: number } }) => {
            const inc = { "usage.costUsd": costUsd, "usage.inputTokens": tokens.input, "usage.outputTokens": tokens.output, "usage.reasoningTokens": tokens.reasoning }
            // O custo do fork também soma no uso da mesa.
            await AgenticFork.updateOne(filter, { $inc: inc })
            await AgenticWorkbench.updateOne({ _id: doc.workbenchId }, { $inc: inc })
        },
        heartbeat: async () => {
            await AgenticFork.updateOne(filter, { $set: { heartbeatAt: new Date() } })
        },
    }
}

/** Executa o turno do fork em segundo plano; no turno de consolidação, extrai o resumo. */
async function executeForkTurn(id: string, text: string, controller: AbortController): Promise<void> {
    const fork = (await AgenticFork.findById(id).lean()) as unknown as IAgenticFork | null
    if (!fork) return
    if (!fork.sessionId) throw new Error("O fork não tem uma sessão do OpenCode")
    const { config } = await loadCentral(fork.centralId)
    const { settings } = await loadAgenticSettings()
    const agent = resolveAgent(settings, config, "fork")
    const client = await getOpencodeClient()
    const publish = (event: WorkbenchEventPayload) => publishWorkbenchEvent(id, event)
    // Resumos de forks filhos que não viraram instrução da sessão vão no prompt (uma vez).
    if (fork.childNotes?.length && fork.childNotesSynced === false) {
        text = `${forkNotesInstructions(fork.childNotes, "fork")}\n\n---\n${text}`
        await AgenticFork.updateOne({ _id: fork._id }, { $set: { childNotesSynced: true } })
    }
    log.info({ forkId: id, workbenchId: fork.workbenchId, agent: agent.agent, model: agent.model }, `Fork ${fork.number} ${fork.taskCode}: turno iniciado`)
    const result = await runAgentTurn(
        client,
        { id, sessionId: fork.sessionId, stage: "fork", title: `Fork ${fork.number}`, agent, text, timeoutMs: TURN_TIMEOUT_MS, signal: controller.signal, consumption: { origin: "agentic", subject: fork.workbenchId } },
        { ...turnHooks(fork), publish },
    )
    await flushWorkbenchEvents(id)
    const current = (await AgenticFork.findById(id).select({ status: 1 }).lean()) as unknown as Pick<IAgenticFork, "status"> | null
    const set: Record<string, unknown> = { runState: result.outcome === "succeeded" ? "idle" : result.outcome === "interrupted" ? "interrupted" : "failed", error: result.outcome === "succeeded" ? null : (result.message ?? "O agente não concluiu a resposta"), pendingForms: [], pendingPermissions: [] }
    if (current?.status === "integrating" && result.outcome === "succeeded") {
        const summary = extractForkSummary(result.text)
        if (summary) set.summary = summary
        else Object.assign(set, { runState: "failed", error: "O agente não devolveu o resumo para integração. Use Tentar novamente." })
    }
    // Um fork concluído junto com a mesa no meio do turno continua concluído.
    await AgenticFork.updateOne({ _id: id, status: { $ne: "concluded" } }, { $set: set })
    log.info({ forkId: id, outcome: result.outcome, costUsd: result.costUsd }, `Fork ${fork.number} ${fork.taskCode}: ${result.outcome}`)
}

/** Dispara um turno do fork em segundo plano (a rota responde na hora; a saída chega pelo stream). */
async function launchForkTurn(fork: IAgenticFork, text: string, options: { userText?: string; set?: Record<string, unknown> } = {}): Promise<void> {
    const id = String(fork._id)
    if (isWorkbenchActive(id)) throw new DomainError(409, "O agente já está respondendo neste fork", "FORK_BUSY")
    await prepareHub(id)
    if (options.userText) publishWorkbenchEvent(id, { type: "user", text: options.userText })
    const controller = new AbortController()
    markWorkbenchActive(id, controller)
    try {
        await AgenticFork.updateOne({ _id: fork._id }, { $set: { ...options.set, runState: "running", error: null, lastPrompt: { text }, turnStartedAt: new Date(), heartbeatAt: new Date(), pendingForms: [], pendingPermissions: [] } })
    } catch (error) {
        clearWorkbenchActive(id, controller)
        throw error
    }
    await publishFork(fork)
    void executeForkTurn(id, text, controller)
        .catch(async (error) => {
            log.error({ err: errorText(error), forkId: id }, "[agentic-fork] falha inesperada no turno")
            notice(id, "error", errorText(error))
            await flushWorkbenchEvents(id).catch(() => undefined)
            await AgenticFork.updateOne({ _id: id, status: { $ne: "concluded" } }, { $set: { runState: "failed", error: errorText(error), pendingForms: [], pendingPermissions: [] } }).catch(() => undefined)
        })
        .finally(() => {
            clearWorkbenchActive(id, controller)
            void publishFork(fork)
        })
}

/** Desvincula a sessão do fork e a exclui no OpenCode (pendente na mesa se falhar). */
async function finishForkSession(fork: Pick<IAgenticFork, "_id" | "workbenchId" | "sessionId">): Promise<void> {
    const sessionId = fork.sessionId
    if (!sessionId) return
    await AgenticFork.updateOne({ _id: fork._id }, { $set: { sessionId: null, sessionDirectory: null } })
    await AgenticWorkbench.updateOne({ _id: fork.workbenchId }, { $addToSet: { pendingSessionDeletions: sessionId } })
    const removed = await deleteWorkbenchSession(fork.workbenchId, sessionId).catch(() => false)
    if (!removed) log.info({ forkId: String(fork._id), sessionId }, "[agentic-fork] sessão do OpenCode pendente de exclusão")
}

/** Interrompe o turno vivo do fork (melhor esforço). */
async function stopForkRun(fork: Pick<IAgenticFork, "_id" | "sessionId">, reason: string): Promise<void> {
    const id = String(fork._id)
    if (!isWorkbenchActive(id)) return
    if (fork.sessionId) await (await getOpencodeClient()).session.interrupt({ sessionID: fork.sessionId }).catch(() => undefined)
    abortWorkbenchRun(id, reason)
}

function workbenchContext(workbench: IAgenticWorkbench, config: CentralConfig, projectName: string, repo: string | null): WorkbenchContext {
    return {
        code: workbench.taskCode,
        title: workbench.taskTitle,
        projectName,
        repo,
        sessionDirectory: config.sessionDirectory,
        worktreePath: workbench.worktreePath ?? worktreePathFor(config, workbench.taskCode),
        branch: workbench.branch ?? branchNameFor(config, { code: workbench.taskCode, title: workbench.taskTitle }),
        composeProject: workbench.composeProject ?? composeProjectFor(projectName, workbench.taskCode),
    }
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

/**
 * Abre um fork da conversa com a primeira mensagem do usuário. Disponível em qualquer etapa, inclusive
 * com o agente principal trabalhando (o fork copia o histórico até aqui e não ocupa vaga na central).
 * Com `parentForkId`, é um fork de fork: copia a conversa do fork pai (em aberto) até aqui.
 */
export async function openFork(workbenchId: string, text: string, parentForkId?: string): Promise<ForkDto> {
    const workbench = await loadWorkbenchDoc(workbenchId)
    const { doc: central, config } = await loadCentral(workbench.centralId)
    await assertForkReady(config)
    const parent = parentForkId ? await loadParentFork(workbenchId, parentForkId) : null
    const numbered = (await AgenticWorkbench.findOneAndUpdate({ _id: workbench._id }, { $inc: { forkSeq: 1 } }, { new: true }).lean()) as unknown as Pick<IAgenticWorkbench, "forkSeq"> | null
    const number = numbered?.forkSeq ?? (workbench.forkSeq ?? 0) + 1
    const client = await getOpencodeClient()
    const session = parent ? await createChildForkSession(client, workbench, parent, number) : await createForkSession(client, workbench, config, number)

    let fork: IAgenticFork
    try {
        fork = (
            await AgenticFork.create({
                workbenchId,
                centralId: workbench.centralId,
                taskId: workbench.taskId,
                taskCode: workbench.taskCode,
                number,
                parentForkId: parent ? String(parent._id) : null,
                parentNumber: parent?.number ?? null,
                status: "active",
                runState: "idle",
                sessionId: session.sessionId,
                sessionDirectory: session.directory,
                origin: session.origin,
                forkedFromStage: workbench.stage,
            })
        ).toObject() as unknown as IAgenticFork
    } catch (error) {
        await client.session.remove({ sessionID: session.sessionId }).catch(() => undefined)
        throw error
    }
    const id = String(fork._id)
    await prepareHub(id)
    const restricted = session.origin === "fresh" || (await restrictSession(client, session.sessionId))
    const instructions = forkInstructions(config.instructions.fork)
    const protocolApplied = await applyProtocol(client, session.sessionId, instructions)
    const stageLabel = WORKBENCH_STAGE_LABELS[asStage(workbench.stage)]
    notice(
        id,
        "info",
        parent
            ? `Fork ${number} da conversa do Fork ${parent.number} (etapa "${stageLabel}"), somente leitura.`
            : session.origin === "fork"
              ? `Fork ${number} da conversa principal (etapa "${stageLabel}"), somente leitura.`
              : `Fork ${number}: a conversa principal não está disponível; sessão nova com o contexto da mesa (etapa "${stageLabel}"), somente leitura.`,
    )
    if (!restricted) notice(id, "warn", "Não foi possível restringir as permissões da sessão do fork; o agente foi instruído a não alterar arquivos.")

    const freshContext =
        session.origin === "fresh"
            ? forkFreshContextPrompt(workbenchContext(workbench, config, central.projectName, (await repoForProject(central.projectId))?.repo ?? null), { stage: asStage(workbench.stage), plan: workbench.plans?.at(-1)?.text ?? null, prUrl: workbench.pr?.url ?? null })
            : null
    const prompt = forkFirstPrompt(text, freshContext)
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_FORK, entidadeId: id, acao: AcaoAuditoria.CRIAR, depois: { tarefa: workbench.taskCode, fork: number, origem: session.origin, etapa: workbench.stage, ...(parent ? { forkPai: parent.number } : {}) } })
    log.info({ forkId: id, workbenchId, origin: session.origin, parentForkId: parent ? String(parent._id) : null }, `Fork ${number} ${workbench.taskCode}: aberto`)
    await launchForkTurn(fork, protocolApplied ? prompt : `${instructions}\n\n---\n${prompt}`, { userText: text })
    return getFork(workbenchId, id)
}

/** Nova mensagem do usuário no fork ativo. */
export async function sendForkMessage(workbenchId: string, forkId: string, text: string): Promise<ForkDto> {
    const fork = await loadFork(workbenchId, forkId)
    assertForkAction(fork, "send")
    await assertForkReady((await loadCentral(fork.centralId)).config)
    await launchForkTurn(fork, text, { userText: text })
    return getFork(workbenchId, forkId)
}

async function setStatus(fork: IAgenticFork, set: Record<string, unknown>, audit: { antes: Record<string, unknown>; depois: Record<string, unknown> }, message: string): Promise<void> {
    await AgenticFork.updateOne({ _id: fork._id }, { $set: set })
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_FORK, entidadeId: String(fork._id), acao: AcaoAuditoria.ATUALIZAR, antes: { tarefa: fork.taskCode, fork: fork.number, ...audit.antes }, depois: { tarefa: fork.taskCode, fork: fork.number, ...audit.depois } })
    await prepareHub(String(fork._id))
    notice(String(fork._id), "info", message)
    await publishFork(fork)
}

/** Encerra o fork: libera Retomar conversa, Integrar fork e Descartar fork. */
export async function closeFork(workbenchId: string, forkId: string): Promise<ForkDto> {
    const fork = await loadFork(workbenchId, forkId)
    assertForkAction(fork, "close")
    await setStatus(fork, { status: "closed", closedAt: new Date(), runState: "idle", error: null }, { antes: { status: fork.status }, depois: { status: "closed" } }, "Fork encerrado.")
    return getFork(workbenchId, forkId)
}

/** Retoma a conversa de um fork encerrado. */
export async function resumeFork(workbenchId: string, forkId: string): Promise<ForkDto> {
    const fork = await loadFork(workbenchId, forkId)
    assertForkAction(fork, "resume")
    await setStatus(fork, { status: "active", closedAt: null }, { antes: { status: fork.status }, depois: { status: "active" } }, "Conversa retomada.")
    return getFork(workbenchId, forkId)
}

export async function interruptFork(workbenchId: string, forkId: string): Promise<ForkDto> {
    const fork = await loadFork(workbenchId, forkId)
    await stopForkRun(fork, "Interrompido pelo usuário")
    return getFork(workbenchId, forkId)
}

/** Refaz o último turno que falhou ou foi interrompido (conversa ou consolidação do resumo). */
export async function retryFork(workbenchId: string, forkId: string): Promise<ForkDto> {
    const fork = await loadFork(workbenchId, forkId)
    assertForkAction(fork, "retry")
    if (!fork.lastPrompt?.text) throw new DomainError(409, "Não há mensagem para tentar de novo", "FORK_INVALID_STATE")
    await assertForkReady((await loadCentral(fork.centralId)).config)
    await launchForkTurn(fork, forkRetryPrompt(fork.error, fork.lastPrompt.text), { userText: "Tentar novamente" })
    return getFork(workbenchId, forkId)
}

/** Integrar fork: o agente consolida o resumo do que foi levantado (o usuário revisa antes de aplicar). */
export async function integrateFork(workbenchId: string, forkId: string): Promise<ForkDto> {
    const fork = await loadFork(workbenchId, forkId)
    assertForkAction(fork, "integrate")
    await assertForkReady((await loadCentral(fork.centralId)).config)
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_FORK, entidadeId: forkId, acao: AcaoAuditoria.ATUALIZAR, antes: { tarefa: fork.taskCode, fork: fork.number, status: fork.status }, depois: { tarefa: fork.taskCode, fork: fork.number, status: "integrating" } })
    await launchForkTurn(fork, forkIntegratePrompt(), { userText: "Integrar fork: consolidar o resumo", set: { status: "integrating", summary: null } })
    return getFork(workbenchId, forkId)
}

/** Modificar o resumo: o agente o reescreve conforme o pedido (itera até o usuário aplicar ou cancelar). */
export async function reviseForkSummary(workbenchId: string, forkId: string, request: string): Promise<ForkDto> {
    const fork = await loadFork(workbenchId, forkId)
    assertForkAction(fork, "revise-summary")
    await assertForkReady((await loadCentral(fork.centralId)).config)
    await launchForkTurn(fork, forkReviseSummaryPrompt(request, fork.summary), { userText: request })
    return getFork(workbenchId, forkId)
}

/** Cancela a integração: o fork volta a Encerrado e o resumo proposto é descartado. */
export async function cancelForkIntegration(workbenchId: string, forkId: string): Promise<ForkDto> {
    const fork = await loadFork(workbenchId, forkId)
    assertForkAction(fork, "cancel-integration")
    await setStatus(fork, { status: "closed", summary: null, runState: "idle", error: null }, { antes: { status: fork.status }, depois: { status: "closed" } }, "Integração cancelada.")
    return getFork(workbenchId, forkId)
}

/**
 * Aplica o resumo no destino escolhido e finaliza o fork como histórico (a sessão é excluída): fork
 * pai (instrução durável da conversa dele), contexto da conversa principal (instrução durável da
 * sessão da mesa), planejador (nova versão do plano pela ação de correção da etapa) ou reabertura.
 */
export async function applyForkIntegration(workbenchId: string, forkId: string, target: ForkIntegrationTarget): Promise<ForkDto> {
    const fork = await loadFork(workbenchId, forkId)
    assertForkAction(fork, "apply")
    const summary = fork.summary!
    const workbench = await getWorkbench(workbenchId)
    const view = { stage: workbench.stage, runState: workbench.runState, sessionId: workbench.sessionId, waitingSlot: Boolean(workbench.slotQueue) }
    const option = forkIntegrationTargets(view, await parentView(fork)).find((item) => item.target === target)
    if (!option?.available) throw new DomainError(409, option?.reason ?? "Destino indisponível", "FORK_TARGET_UNAVAILABLE")

    switch (target) {
        case "parent": {
            const parentId = fork.parentForkId!
            await AgenticFork.updateOne({ _id: parentId }, { $push: { childNotes: { forkId, number: fork.number, summary, createdAt: new Date() } } })
            const parent = (await AgenticFork.findById(parentId).lean()) as unknown as IAgenticFork | null
            if (parent) await applyChildNotes(await getOpencodeClient(), parent)
            await prepareHub(parentId)
            notice(parentId, "info", `Resumo do Fork ${fork.number} integrado a esta conversa.`)
            if (parent) await publishFork(parent)
            break
        }
        case "context": {
            await AgenticWorkbench.updateOne({ _id: workbenchId }, { $push: { forkNotes: { forkId, number: fork.number, summary, createdAt: new Date() } } })
            const updated = await loadWorkbenchDoc(workbenchId)
            if (updated.sessionId) await applyForkNotes(await getOpencodeClient(), updated, updated.sessionId)
            await prepareHub(workbenchId)
            publishWorkbenchEvent(workbenchId, { type: "notice", level: "info", message: `Resumo do Fork ${fork.number} integrado ao contexto da conversa principal.` })
            await publishAgentic({ centralId: fork.centralId, workbenchId, taskId: fork.taskId })
            break
        }
        case "planner": {
            const action = plannerActionFor(view)!
            const feedback = forkPlannerFeedback(fork.number, summary)
            if (action === "revise-plan") await revisePlan(workbenchId, feedback)
            else if (action === "request-correction") await requestCorrection(workbenchId, feedback)
            else await submitPrFeedback(workbenchId, feedback)
            break
        }
        case "reopen":
            await reopen(workbenchId, forkPlannerFeedback(fork.number, summary))
            break
    }

    await AgenticFork.updateOne({ _id: fork._id }, { $set: { status: "integrated", integration: { target, summary, appliedAt: new Date() }, runState: "idle", error: null } })
    await finishForkSession(fork)
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_FORK, entidadeId: forkId, acao: AcaoAuditoria.ATUALIZAR, antes: { tarefa: fork.taskCode, fork: fork.number, status: fork.status }, depois: { tarefa: fork.taskCode, fork: fork.number, status: "integrated", destino: target } })
    await prepareHub(forkId)
    notice(forkId, "success", `Fork integrado: ${FORK_INTEGRATION_TARGET_LABELS[target].label}.`)
    log.info({ forkId, workbenchId, target }, `Fork ${fork.number} ${fork.taskCode}: integrado`)
    await publishFork(fork)
    return getFork(workbenchId, forkId)
}

/** Descartar fork: remove o fork, a saída e a sessão do OpenCode (fica inacessível). */
export async function discardFork(workbenchId: string, forkId: string): Promise<void> {
    const fork = await loadFork(workbenchId, forkId)
    assertForkAction(fork, "discard")
    await finishForkSession(fork)
    await dropWorkbenchEvents(forkId)
    await AgenticFork.deleteOne({ _id: fork._id })
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_FORK, entidadeId: forkId, acao: AcaoAuditoria.EXCLUIR, antes: { tarefa: fork.taskCode, fork: fork.number, status: fork.status } })
    log.info({ forkId, workbenchId }, `Fork ${fork.number} ${fork.taskCode}: descartado`)
    await publishFork(fork)
}

export async function replyForkForm(workbenchId: string, forkId: string, formId: string, input: FormReplyInput): Promise<ForkDto> {
    const fork = await loadFork(workbenchId, forkId)
    if (!fork.sessionId || !(fork.pendingForms as { id?: string }[]).some((item) => item.id === formId)) throw new DomainError(404, "Pergunta não encontrada (já respondida?)", "FORM_NOT_FOUND")
    const client = await getOpencodeClient()
    if (input.cancel) await client.session.form.cancel({ sessionID: fork.sessionId, formID: formId })
    else await client.session.form.reply({ sessionID: fork.sessionId, formID: formId, answer: input.answer ?? {} })
    await prepareHub(forkId)
    if (input.answer && !input.cancel) {
        const summary = Object.values(input.answer)
            .map((value) => (Array.isArray(value) ? value.join(", ") : String(value)))
            .join(" · ")
        if (summary) publishWorkbenchEvent(forkId, { type: "user", text: summary })
    }
    publishWorkbenchEvent(forkId, { type: "form-closed", id: formId })
    await AgenticFork.updateOne({ _id: fork._id }, { $pull: { pendingForms: { id: formId } } })
    await publishFork(fork)
    return getFork(workbenchId, forkId)
}

export async function replyForkPermission(workbenchId: string, forkId: string, requestId: string, input: PermissionReplyInput): Promise<ForkDto> {
    const fork = await loadFork(workbenchId, forkId)
    if (!fork.sessionId || !(fork.pendingPermissions as { id?: string }[]).some((item) => item.id === requestId)) throw new DomainError(404, "Pedido de permissão não encontrado (já respondido?)", "PERMISSION_NOT_FOUND")
    const client = await getOpencodeClient()
    await client.permission.reply({ sessionID: fork.sessionId, requestID: requestId, decision: input.decision, ...(input.message ? { message: input.message } : {}) })
    await prepareHub(forkId)
    publishWorkbenchEvent(forkId, { type: "permission-replied", id: requestId, decision: input.decision })
    await AgenticFork.updateOne({ _id: fork._id }, { $pull: { pendingPermissions: { id: requestId } } })
    await publishFork(fork)
    return getFork(workbenchId, forkId)
}

// ---------------------------------------------------------------------------
// Conclusão e exclusão da mesa
// ---------------------------------------------------------------------------

const openForksFilter = (workbenchId: string) => ({ workbenchId, status: { $in: [...OPEN_FORK_STATUSES] } })

/** Conclui os forks em aberto da mesa: para o turno, exclui a sessão e os deixa como histórico. */
export async function concludeForks(workbenchId: string): Promise<number> {
    await dbConnect()
    const forks = (await AgenticFork.find(openForksFilter(workbenchId)).lean()) as unknown as IAgenticFork[]
    for (const fork of forks) {
        const id = String(fork._id)
        await AgenticFork.updateOne({ _id: fork._id }, { $set: { status: "concluded", runState: "idle", error: null, closedAt: new Date(), pendingForms: [], pendingPermissions: [] } })
        await stopForkRun(fork, "Fork concluído junto com a mesa").catch(() => undefined)
        await finishForkSession(fork)
        await prepareHub(id)
        notice(id, "info", "Fork concluído junto com a mesa.")
        await publishFork(fork)
    }
    return forks.length
}

/**
 * Mesa concluída: aplica a política da central aos forks em aberto — conclui, mantém ou deixa a
 * pergunta pendente na mesa ("Sempre perguntar").
 */
export async function handleWorkbenchDone(workbench: Pick<IAgenticWorkbench, "_id" | "centralId" | "taskId" | "taskCode">, policy: ForkDonePolicy): Promise<void> {
    const workbenchId = String(workbench._id)
    const count = await AgenticFork.countDocuments(openForksFilter(workbenchId))
    if (!count) return
    await prepareHub(workbenchId)
    if (policy === "conclude") {
        const concluded = await concludeForks(workbenchId)
        publishWorkbenchEvent(workbenchId, { type: "notice", level: "info", message: `${concluded} fork(s) em aberto concluído(s) junto com a mesa.` })
        await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_FORK, entidadeId: workbenchId, acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: workbench.taskCode, forksConcluidos: concluded } })
        return
    }
    if (policy === "keep") {
        publishWorkbenchEvent(workbenchId, { type: "notice", level: "info", message: `${count} fork(s) continuam abertos depois da conclusão.` })
        return
    }
    await AgenticWorkbench.updateOne({ _id: workbench._id }, { $set: { forksDonePrompt: { count, at: new Date() } } })
    publishWorkbenchEvent(workbenchId, { type: "notice", level: "info", message: `A mesa foi concluída com ${count} fork(s) em aberto: escolha se eles também devem ser concluídos.` })
    await publishAgentic({ centralId: workbench.centralId, workbenchId, taskId: workbench.taskId })
}

/** Resposta à pergunta da mesa concluída com forks em aberto. */
export async function resolveForksDonePrompt(workbenchId: string, decision: "conclude" | "keep"): Promise<WorkbenchDto> {
    const workbench = await loadWorkbenchDoc(workbenchId)
    if (!workbench.forksDonePrompt) throw new DomainError(409, "Não há pergunta pendente sobre os forks desta mesa", "FORKS_PROMPT_NOT_FOUND")
    const concluded = decision === "conclude" ? await concludeForks(workbenchId) : 0
    await AgenticWorkbench.updateOne({ _id: workbench._id }, { $set: { forksDonePrompt: null } })
    await recordAudit({ userId: actorId(), entidade: AGENTIC_AUDIT_FORK, entidadeId: workbenchId, acao: AcaoAuditoria.ATUALIZAR, antes: { tarefa: workbench.taskCode, perguntaForks: workbench.forksDonePrompt.count }, depois: { tarefa: workbench.taskCode, decisao: decision, forksConcluidos: concluded } })
    await prepareHub(workbenchId)
    publishWorkbenchEvent(workbenchId, { type: "notice", level: "info", message: decision === "conclude" ? `${concluded} fork(s) concluído(s).` : "Os forks em aberto foram mantidos." })
    await publishAgentic({ centralId: workbench.centralId, workbenchId, taskId: workbench.taskId })
    return getWorkbench(workbenchId)
}

/**
 * Exclusão da mesa: interrompe e apaga os forks e a saída deles. As sessões entram nas exclusões
 * pendentes da mesa, que `deleteWorkbench` tenta antes de remover o registro.
 */
export async function deleteWorkbenchForks(workbenchId: string): Promise<void> {
    await dbConnect()
    const forks = (await AgenticFork.find({ workbenchId }).lean()) as unknown as IAgenticFork[]
    for (const fork of forks) {
        await stopForkRun(fork, "Mesa excluída").catch(() => undefined)
        if (fork.sessionId) await AgenticWorkbench.updateOne({ _id: workbenchId }, { $addToSet: { pendingSessionDeletions: fork.sessionId } })
        await dropWorkbenchEvents(String(fork._id)).catch(() => undefined)
    }
    await AgenticFork.deleteMany({ workbenchId })
}

/** Exclusão da central: preserva referências quando a sessão não puder ser removida. */
export async function deleteCentralForks(centralId: string): Promise<void> {
    await dbConnect()
    const forks = (await AgenticFork.find({ centralId }).lean()) as unknown as IAgenticFork[]
    for (const fork of forks) {
        await stopForkRun(fork, "Central excluída").catch(() => undefined)
        if (fork.sessionId) {
            await AgenticWorkbench.updateOne({ _id: fork.workbenchId }, { $addToSet: { pendingSessionDeletions: fork.sessionId } })
            if (!(await deleteWorkbenchSession(fork.workbenchId, fork.sessionId))) {
                throw new DomainError(409, "Não foi possível excluir a sessão de um fork. Tente novamente quando o OpenCode estiver disponível.", "FORK_SESSION_CLEANUP_PENDING")
            }
        }
        await dropWorkbenchEvents(String(fork._id)).catch(() => undefined)
    }
    await AgenticFork.deleteMany({ centralId })
}
