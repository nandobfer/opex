import { isValidObjectId } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { TaskRefinement, type ITaskRefinement } from "@/lib/db/models/Refinement"
import { AgenticCentral } from "@/lib/db/models/Agentic"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import type { OpencodeFormDto, OpencodePermissionDto } from "@/lib/ai/opencode-events"
import { runAgentTurn } from "@/lib/ai/opencode-run"
import { listOpencodeSkillsAt, type SkillListAt } from "@/lib/ai/opencode-skill-list"
import type { TaskRefinementSettings } from "@/features/ai/schemas"
import { publishAppEvent } from "@/lib/pusher/channels"
import { loggerFor } from "@/lib/logger"
import { getLocalUser } from "@/lib/local-user"
import { parseCentralConfig } from "@/features/agentic/logic"
import { asReconnectOutcome } from "@/features/agentic/reconnect"
import { probeReconnect } from "@/features/agentic/server/reconnect"
import { deliverLiveMessage, liveChatEnabled } from "@/features/agentic/server/live-chat"
import type { FormReplyInput, PermissionReplyInput } from "@/features/agentic/schemas"
import type { WorkbenchEventPayload } from "@/features/agentic/types"
import {
    abortWorkbenchRun,
    clearWorkbenchActive,
    dropWorkbenchEvents,
    flushWorkbenchEvents,
    isWorkbenchActive,
    markWorkbenchActive,
    prepareHub,
    publishWorkbenchEvent,
} from "@/features/agentic/server/hub"
import { getTask } from "@/features/tasks/server/service"
import { updateTask } from "@/features/tasks/server/service"
import { availabilityOfTaskRefinement, loadTaskRefinementSettings } from "@/features/ai/server/settings"
import { REFINEMENT_AUDIT_ENTITY, REFINEMENT_INSTRUCTIONS_KEY, REFINEMENT_MAX_RECOVERY_ATTEMPTS, REFINEMENT_SPEC_MISSING_ERROR, REFINEMENT_SPEC_SAVE_ERROR, REFINEMENT_STAGE_LABEL, REFINEMENT_UPDATED_EVENT, REFINEMENT_WORKBENCH_ADVANCED_REASON, refinementFilesOwner } from "../constants"
import { extractTechnicalSpec, extractTechnicalSpecDetail, refinementConcluded } from "../logic"
import {
    buildRefinementFinalizePrompt,
    buildRefinementFreshContinuePrompt,
    buildRefinementInstructions,
    buildRefinementPrompt,
    buildRefinementReopenPrompt,
    buildRefinementResumePrompt,
    planRefinementInstructions,
    withAdditionalInfo,
    type RefinementInstructionsPlan,
} from "../prompt"
import { deleteRefinementSession, flushRefinementSessionDeletions } from "./session-cleanup"
import { delegateToWorkbench, inRefinementStage, linkedWorkbench, pastRefinement, syncLinkedWorkbench, type LinkedWorkbench } from "./workbench-link"
import type { RefinementAvailability, TaskRefinementDto, TaskRefinementStateDto } from "../types"

/**
 * Refinamento de tarefa (SOMENTE servidor): um turno do agente numa sessão longa do OpenCode que lê
 * a tarefa, faz perguntas (formulários) e reescreve a especificação técnica até ela ficar clara.
 *
 * Usa o MESMO barramento de eventos das mesas (`agentic_events`, chaveado pelo id do refinamento) e
 * o runner genérico (`lib/ai/opencode-run.ts`). A cada rodada, a especificação é extraída do texto
 * do agente e gravada no campo `technicalSpec` da tarefa.
 */

const log = loggerFor({ module: "refinement" })
const TURN_TIMEOUT_MS = 6 * 60 * 60_000

const actorId = () => getLocalUser().id
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

function assertRefinementId(id: string): void {
    if (!isValidObjectId(id)) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
}

/** Fato das métricas do Agente Refinador (OPE-122), sem bloquear o refinamento. */
function refinementMetric(doc: Pick<ITaskRefinement, "_id" | "taskId" | "centralId" | "projectId">, type: "refinement-started" | "refinement-questions" | "refinement-completed" | "refinement-abandoned", extra: { dedupKey: string; data?: Record<string, unknown> }): void {
    const at = new Date()
    void import("@/features/agent-metrics/server/record")
        .then(({ recordAgentEvent }) => recordAgentEvent({ agent: "refinador", type, at, dedupKey: extra.dedupKey, taskId: doc.taskId, centralId: doc.centralId ?? null, refId: String(doc._id), data: extra.data ?? null }))
        .catch(() => undefined)
}

/** Execução (turno) do Agente Refinador para o uso por data. */
function refinementRun(doc: Pick<ITaskRefinement, "_id" | "taskId" | "taskCode" | "taskTitle" | "centralId">, result: { ok: boolean; error: string | null; durationMs: number | null; costUsd: number | null }): void {
    const finishedAt = new Date()
    void import("@/features/agent-metrics/server/record")
        .then(({ recordAgentRun }) =>
            recordAgentRun({
                dedupKey: `refinement-turn:${String(doc._id)}:${finishedAt.getTime()}`,
                agent: "refinador",
                kind: "refinement-turn",
                finishedAt,
                startedAt: result.durationMs ? new Date(finishedAt.getTime() - result.durationMs) : null,
                ok: result.ok,
                error: result.error,
                refId: String(doc._id),
                title: doc.taskTitle ?? null,
                taskId: doc.taskId,
                taskCode: doc.taskCode,
                centralId: doc.centralId ?? null,
                costUsd: result.costUsd,
                durationMs: result.durationMs,
            }),
        )
        .catch(() => undefined)
}

async function loadRefinement(id: string): Promise<ITaskRefinement> {
    assertRefinementId(id)
    await dbConnect()
    const doc = await TaskRefinement.findById(id).lean()
    if (!doc) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
    return doc as unknown as ITaskRefinement
}

async function findByTask(taskId: string): Promise<ITaskRefinement | null> {
    await dbConnect()
    const doc = await TaskRefinement.findOne({ taskId }).lean()
    return (doc as unknown as ITaskRefinement | null) ?? null
}

/** Refinamento "executando" sem turno vivo neste processo (o app reiniciou): vira interrompido. */
async function reconcile(doc: ITaskRefinement): Promise<ITaskRefinement> {
    const id = String(doc._id)
    if (doc.runState !== "running" || isWorkbenchActive(id)) return doc
    const error = "A execução foi perdida neste app (o app reiniciou durante o turno). Use Reconectar para acompanhar o agente ou Continuar para retomar."
    await TaskRefinement.updateOne({ _id: doc._id, runState: "running" }, { $set: { runState: "interrupted", finalizing: false, error, pendingForms: [], pendingPermissions: [] } })
    return { ...doc, runState: "interrupted", finalizing: false, error, pendingForms: [], pendingPermissions: [] }
}

function toRefinementDto(doc: ITaskRefinement, liveChat = false): TaskRefinementDto {
    const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null)
    return {
        id: String(doc._id),
        taskId: doc.taskId,
        taskCode: doc.taskCode,
        taskTitle: doc.taskTitle,
        projectId: doc.projectId,
        centralId: doc.centralId,
        sessionId: doc.sessionId ?? null,
        sessionDirectory: doc.sessionDirectory ?? null,
        runState: (doc.runState as TaskRefinementDto["runState"]) ?? "idle",
        resolved: doc.resolved === true,
        closed: Boolean(doc.closedAt),
        concluded: refinementConcluded({ resolved: doc.resolved === true, closed: Boolean(doc.closedAt) }),
        queued: Boolean(doc.queuedStart),
        finalizing: doc.finalizing === true,
        error: doc.error ?? null,
        spec: doc.spec ?? null,
        pendingForms: (doc.pendingForms ?? []) as OpencodeFormDto[],
        pendingPermissions: (doc.pendingPermissions ?? []) as OpencodePermissionDto[],
        usage: { costUsd: doc.usage?.costUsd ?? 0, inputTokens: doc.usage?.inputTokens ?? 0, outputTokens: doc.usage?.outputTokens ?? 0, reasoningTokens: doc.usage?.reasoningTokens ?? 0 },
        turnStartedAt: iso(doc.turnStartedAt),
        stoppedByUser: Boolean(doc.stopRequestedAt),
        reconnect: doc.reconnect ? { outcome: asReconnectOutcome(doc.reconnect.outcome) ?? "transient", message: doc.reconnect.message ?? null, at: new Date(doc.reconnect.at).toISOString() } : null,
        liveChat,
        startedAt: iso(doc.startedAt) ?? new Date().toISOString(),
        updatedAt: iso(doc.updatedAt) ?? new Date().toISOString(),
    }
}

async function publishRefinement(taskId: string): Promise<void> {
    await publishAppEvent(REFINEMENT_UPDATED_EVENT, { taskId }).catch(() => undefined)
    // A mesa da tarefa (em "Refinando"/"Especificação pronta") acompanha o mesmo estado (OPE-137).
    syncLinkedWorkbench(taskId)
}

/** Refinar com a mesa já do planejamento em diante: recusado com o motivo da tela (item 18). */
function assertNotPastRefinement(link: LinkedWorkbench | null): void {
    if (pastRefinement(link)) throw new DomainError(409, REFINEMENT_WORKBENCH_ADVANCED_REASON, "REFINEMENT_WORKBENCH_ADVANCED")
}

interface ResolvedCentral {
    centralId: string
    projectId: string
    projectName: string
    directory: string
}

/** Central de desenvolvimento do projeto da tarefa (diretório das sessões). Bloqueia sem central. */
async function resolveCentral(task: Awaited<ReturnType<typeof getTask>>): Promise<ResolvedCentral> {
    if (!task.project?.id) throw new DomainError(400, "A tarefa não tem repositório (projeto) vinculado", "TASK_WITHOUT_PROJECT")
    await dbConnect()
    const central = await AgenticCentral.findOne({ projectId: task.project.id }).lean()
    if (!central) throw new DomainError(409, `Crie uma central de desenvolvimento para ${task.project.name} em Integrações › Inteligência Artificial`, "CENTRAL_NOT_FOUND")
    const config = parseCentralConfig(central.config)
    if (!config.enabled) throw new DomainError(409, `A central de desenvolvimento de ${central.projectName} está desativada`, "CENTRAL_DISABLED")
    return { centralId: String(central._id), projectId: central.projectId, projectName: central.projectName, directory: config.sessionDirectory }
}

async function availabilityFor(task: Awaited<ReturnType<typeof getTask>>, link: LinkedWorkbench | null = null): Promise<RefinementAvailability> {
    if (pastRefinement(link)) return { available: false, reason: REFINEMENT_WORKBENCH_ADVANCED_REASON, centralId: link.centralId, sessionDirectory: null }
    const { settings } = await loadTaskRefinementSettings()
    const feature = await availabilityOfTaskRefinement(settings)
    if (!feature.available) return { ...feature, centralId: null, sessionDirectory: null }
    if (!task.project?.id) return { available: false, reason: "A tarefa não tem repositório (projeto) vinculado", centralId: null, sessionDirectory: null }
    await dbConnect()
    const central = await AgenticCentral.findOne({ projectId: task.project.id }).lean()
    if (!central) return { available: false, reason: `Crie uma central de desenvolvimento para ${task.project.name} em Integrações › Inteligência Artificial`, centralId: null, sessionDirectory: null }
    const config = parseCentralConfig(central.config)
    if (!config.enabled) return { available: false, reason: `A central de desenvolvimento de ${central.projectName} está desativada`, centralId: String(central._id), sessionDirectory: config.sessionDirectory }
    return { available: true, reason: null, centralId: String(central._id), sessionDirectory: config.sessionDirectory }
}

/** Estado do refinamento da tarefa (com a disponibilidade para o botão). */
export async function getRefinementState(taskId: string): Promise<TaskRefinementStateDto> {
    const task = await getTask(taskId)
    const raw = await findByTask(taskId)
    const doc = raw ? await reconcile(raw) : null
    const link = await linkedWorkbench(taskId)
    const { settings } = await loadTaskRefinementSettings()
    return {
        refinement: doc ? toRefinementDto(doc, await liveChatEnabled(doc.centralId)) : null,
        availability: await availabilityFor(task, link),
        workbench: link ? { id: link.id, stage: link.stage } : null,
        refinerModel: { agent: settings.agent ?? null, model: settings.model ?? null, variant: settings.variant ?? null },
    }
}

/**
 * Grava a especificação extraída do texto do agente em `technicalSpec` da tarefa. Devolve `true`
 * quando a especificação existe e está gravada (inclusive se já era a mesma) e `false` quando o texto
 * não traz a especificação. Uma falha ao gravar é propagada, para o turno não marcar como esclarecido
 * sem persistir.
 */
async function saveSpec(taskId: string, text: string, tolerance?: SpecToleranceLog): Promise<boolean> {
    const extracted = extractTechnicalSpecDetail(text)
    if (!extracted) return false
    const { spec } = extracted
    const current = await TaskRefinement.findOne({ taskId }).select({ spec: 1 }).lean()
    if ((current as { spec?: string | null } | null)?.spec !== spec) {
        await updateTask(taskId, { technicalSpec: spec }, actorId())
        await TaskRefinement.updateOne({ taskId }, { $set: { spec } })
    }
    if (extracted.tolerant && tolerance && !tolerance.logged) {
        tolerance.logged = true
        log.info({ taskId, refinementId: tolerance.refinementId }, "[refinement] especificação extraída com título fora do padrão (texto colado antes ou sufixo)")
    }
    return true
}

/** Log único por turno quando a especificação só foi reconhecida pela tolerância do extrator. */
interface SpecToleranceLog {
    refinementId: string
    logged: boolean
}

/** Id do refinamento da tarefa (para o stream de eventos). `null` quando não há. */
export async function refinementIdForTask(taskId: string): Promise<string | null> {
    const doc = await findByTask(taskId)
    return doc ? String(doc._id) : null
}

/**
 * Aplica as instruções (as configuradas + o protocolo fixo) como entrada durável da sessão do
 * OpenCode, para a sessão inteira. Devolve `true` em caso de sucesso e `false` quando o servidor não
 * aceita a entrada (o turno então reenvia o protocolo no próprio prompt).
 */
async function applyInstructions(client: OpencodeClient, sessionId: string, instructions: string): Promise<boolean> {
    try {
        await client.session.instructions.entry.put({ sessionID: sessionId, key: REFINEMENT_INSTRUCTIONS_KEY, value: instructions })
        return true
    } catch (error) {
        log.warn({ err: errorText(error), sessionId }, "[refinement] não foi possível aplicar as instruções à sessão; o protocolo irá no prompt do turno")
        return false
    }
}

/**
 * Origem das instruções do turno. Com "skill", confere a skill no diretório da SESSÃO (as skills do
 * OpenCode dependem do diretório) e, fora do turno acompanhado (`attach`), ativa a skill na sessão uma
 * vez por sessão/skill. Qualquer falha cai nas instruções de texto, com aviso no log e na saída.
 */
async function resolveInstructionsPlan(client: OpencodeClient, doc: ITaskRefinement, settings: TaskRefinementSettings, sessionId: string, directory: string, attach: boolean): Promise<RefinementInstructionsPlan> {
    if (settings.instructionsSource !== "skill") return { mode: "text", fallback: null }
    // Diretório recém-aberto lista as skills aos poucos: a listagem espera carregar (OPE-158).
    const listed: SkillListAt | null = await listOpencodeSkillsAt(client, directory, { want: settings.skill ? [settings.skill] : [] }).catch((error: unknown) => {
        log.warn({ err: errorText(error), refinementId: String(doc._id), directory }, "[refinement] não foi possível listar as skills do OpenCode")
        return null
    })
    const plan = planRefinementInstructions(settings, listed?.skills ?? null, listed ? { directory: listed.directory } : undefined)
    if (plan.mode !== "skill") {
        if (listed && plan.fallback) log.warn({ refinementId: String(doc._id), skill: settings.skill, directory: listed.directory, attempts: listed.attempts, ids: listed.skills.map((skill) => skill.id) }, "[refinement] skill configurada não pôde ser usada no diretório da sessão")
        return plan
    }
    const active = doc.activeSkill
    if (active?.sessionId === sessionId && active.skillId === plan.skill.id) return plan
    // Reconectar não ativa nada: sem a skill já ativa nesta sessão, o turno acompanhado segue com o texto.
    if (attach) return { mode: "text", fallback: null }
    try {
        await client.session.skill({ sessionID: sessionId, id: plan.skill.id, resume: false })
        await TaskRefinement.updateOne({ _id: doc._id }, { $set: { activeSkill: { sessionId, skillId: plan.skill.id } } })
        log.info({ refinementId: String(doc._id), skill: plan.skill.id, directory: listed?.directory ?? directory }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: skill ativada na sessão`)
        return plan
    } catch (error) {
        log.warn({ err: errorText(error), refinementId: String(doc._id), skill: plan.skill.id }, "[refinement] não foi possível ativar a skill na sessão")
        return { mode: "text", fallback: `Não foi possível ativar a skill "${plan.skill.name}" na sessão do OpenCode: o refinamento usa as instruções de texto.` }
    }
}

/** Sessão do refinamento: a gravada (se ainda existir no OpenCode) ou uma nova no diretório da central. */
async function ensureSession(client: OpencodeClient, doc: ITaskRefinement, directory: string): Promise<string> {
    if (doc.sessionId) {
        const info = await client.session.get({ sessionID: doc.sessionId }).catch(() => null)
        if (info) return doc.sessionId
    }
    const session = await client.session.create({ title: `${doc.taskCode} · Refinar: ${doc.taskTitle}`.slice(0, 120), location: { directory }, metadata: { app: "opex", taskId: doc.taskId, kind: "refinement" } })
    await TaskRefinement.updateOne({ _id: doc._id }, { $set: { sessionId: session.id, sessionDirectory: session.location?.directory ?? directory } })
    return session.id
}

function turnHooks(doc: ITaskRefinement) {
    const filter = { _id: doc._id }
    const changed = () => publishRefinement(doc.taskId)
    // Texto acumulado do turno (para extrair a especificação a cada rodada).
    const accumulated = { text: "" }
    const tolerance: SpecToleranceLog = { refinementId: String(doc._id), logged: false }
    return {
        hooks: {
            onPermission: async (permission: OpencodePermissionDto) => {
                // Deduplica por id: a reconexão pode reenviar uma permissão que já está pendente.
                await TaskRefinement.updateOne(filter, { $pull: { pendingPermissions: { id: permission.id } } })
                await TaskRefinement.updateOne(filter, { $push: { pendingPermissions: permission } })
                await changed()
            },
            onPermissionClosed: async (requestId: string) => {
                await TaskRefinement.updateOne(filter, { $pull: { pendingPermissions: { id: requestId } } })
                await changed()
            },
            onForm: async (form: OpencodeFormDto) => {
                // Deduplica por id: a reconexão pode reenviar uma pergunta que já está pendente.
                await TaskRefinement.updateOne(filter, { $pull: { pendingForms: { id: form.id } } })
                await TaskRefinement.updateOne(filter, { $push: { pendingForms: form } })
                refinementMetric(doc, "refinement-questions", { dedupKey: `refinement-questions:${String(doc._id)}:${form.id}`, data: { questions: form.fields?.length ?? 1 } })
                // Rodada concluída: a especificação atualizada é gravada na tarefa.
                await saveSpec(doc.taskId, accumulated.text, tolerance).catch((error) => log.warn({ err: errorText(error), taskId: doc.taskId }, "[refinement] falha ao salvar a especificação"))
                await changed()
            },
            onFormClosed: async (formId: string) => {
                await TaskRefinement.updateOne(filter, { $pull: { pendingForms: { id: formId } } })
                await changed()
            },
            onText: (delta: string) => {
                accumulated.text += delta
            },
            onStep: async ({ costUsd, tokens }: { costUsd: number; tokens: { input: number; output: number; reasoning: number } }) => {
                await TaskRefinement.updateOne(filter, { $inc: { "usage.costUsd": costUsd, "usage.inputTokens": tokens.input, "usage.outputTokens": tokens.output, "usage.reasoningTokens": tokens.reasoning } })
            },
            heartbeat: async () => {
                await TaskRefinement.updateOne(filter, { $set: { heartbeatAt: new Date() } })
            },
        },
        accumulated,
        tolerance,
    }
}

/**
 * Conclui o refinamento: desvincula a sessão e a exclui no OpenCode (fica pendente se falhar). O
 * histórico do Opex (especificação, saída, uso) é preservado.
 */
async function finishRefinementSession(refinementId: string, sessionId: string): Promise<void> {
    await TaskRefinement.updateOne({ _id: refinementId }, { $set: { sessionId: null, sessionDirectory: null }, $addToSet: { pendingSessionDeletions: sessionId } })
    const removed = await deleteRefinementSession(refinementId, sessionId).catch((error) => {
        log.warn({ err: errorText(error), refinementId, sessionId }, "[refinement] falha ao excluir a sessão do OpenCode")
        return false
    })
    if (removed) log.info({ refinementId }, `${REFINEMENT_STAGE_LABEL}: sessão do OpenCode excluída`)
    else log.info({ refinementId, sessionId }, `${REFINEMENT_STAGE_LABEL}: sessão do OpenCode pendente de exclusão`)
}

/**
 * Executa o turno em segundo plano: garante a sessão, roda o agente, grava a especificação e — quando
 * o turno termina sem produzi-la — dispara turnos automáticos de consolidação (sem exigir "Continuar").
 * Ao concluir, desvincula e exclui a sessão do OpenCode.
 *
 * Com `attach`, NÃO cria sessão nem envia prompt: acompanha a execução já em andamento numa sessão
 * existente (reconexão) e, se ela já terminou, recupera o resultado do histórico e fecha o turno
 * normalmente (especificação, consolidação até o limite, falha).
 */
interface TurnExecutionOptions {
    attach?: boolean
    /** Anexos do primeiro prompt (campo "Informações adicionais" da mesa, OPE-137). */
    fileIds?: string[]
}

/** Anexos do turno em `data:` URI + a seção que os descreve no prompt (módulo de arquivos sob demanda). */
async function turnAttachments(taskCode: string, fileIds: string[] | undefined, signal: AbortSignal): Promise<{ files: { uri: string; name: string }[]; section: string }> {
    if (!fileIds?.length) return { files: [], section: "" }
    const [{ promptFilesFor }, { agenticDownloadDir }] = await Promise.all([import("@/features/agentic/server/files"), import("@/features/agentic/files")])
    return promptFilesFor(fileIds, { downloadDir: agenticDownloadDir(taskCode), signal })
}

/** Mensagem do dono na saída do refinamento (texto e anexos do "Informações adicionais"). */
async function publishUserInput(id: string, userText: string | null | undefined, fileIds: string[] | undefined): Promise<void> {
    const shown = fileIds?.length ? await (await import("@/features/agentic/server/files")).fileDtosFor(fileIds) : []
    if (!userText && !shown.length) return
    publishWorkbenchEvent(id, { type: "user", text: userText || "Arquivos anexados", ...(shown.length ? { files: shown } : {}) })
}

async function executeTurn(id: string, text: string, controller: AbortController, options: TurnExecutionOptions = {}): Promise<void> {
    const doc = await loadRefinement(id)
    const task = await getTask(doc.taskId)
    const { settings } = await loadTaskRefinementSettings()
    const central = await resolveCentral(task)
    const client = await getOpencodeClient()
    const attach = options.attach === true
    // "Modelo do Refinamento" trocado na mesa (OPE-137): vale para os turnos enquanto a mesa refina.
    const link = await linkedWorkbench(doc.taskId)
    const override = inRefinementStage(link) ? link.refinementModel : null
    const agent = { agent: settings.agent, model: override?.model ?? settings.model, variant: override ? override.variant : settings.variant }
    // Reconectar acompanha a sessão existente; um turno normal (re)usa a gravada ou cria uma nova.
    const directory = doc.sessionDirectory ?? central.directory
    const sessionId = attach ? (doc.sessionId as string) : await ensureSession(client, doc, directory)
    const plan = await resolveInstructionsPlan(client, doc, settings, sessionId, directory, attach)
    if (plan.mode === "text" && plan.fallback) {
        log.warn({ refinementId: id }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: ${plan.fallback}`)
        publishWorkbenchEvent(id, { type: "notice", level: "warn", message: plan.fallback })
    }
    const instructions = buildRefinementInstructions(settings, plan)
    const instructionsApplied = await applyInstructions(client, sessionId, instructions)
    // Sem a entrada durável (servidor sem suporte), o protocolo vai no início de cada prompt.
    const withProtocol = (prompt: string) => (instructionsApplied ? prompt : `${instructions}\n\n---\n${prompt}`)
    // O runner genérico emite os eventos via `publish`; sem isto a saída não chega ao stream.
    const publish = (event: WorkbenchEventPayload) => publishWorkbenchEvent(id, event)
    // Marco do turno acompanhado (reconexão): delimita o resultado recuperado do histórico.
    const startedAt = doc.turnStartedAt ? new Date(doc.turnStartedAt).getTime() : 0

    const attachments = attach ? { files: [], section: "" } : await turnAttachments(doc.taskCode, options.fileIds, controller.signal)
    let prompt = withProtocol(attachments.section ? `${text}\n\n${attachments.section}` : text)
    let result: Awaited<ReturnType<typeof runAgentTurn>> = { outcome: "failed", text: "", message: null, costUsd: 0, durationMs: 0 }
    let textOut = ""
    let specSaved = false
    for (let attempt = 0; ; attempt++) {
        const { hooks, accumulated, tolerance } = turnHooks(doc)
        // O attach vale só para o primeiro turno: as consolidações são turnos novos normais.
        const attachThisTurn = attach && attempt === 0
        log.info({ refinementId: id, agent: agent.agent, model: agent.model, attempt, attach: attachThisTurn }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: turno iniciado`)
        result = await runAgentTurn(
            client,
            {
                id,
                sessionId,
                stage: REFINEMENT_STAGE_LABEL,
                title: REFINEMENT_STAGE_LABEL,
                agent,
                text: attachThisTurn ? "" : prompt,
                ...(attempt === 0 && attachments.files.length ? { files: attachments.files } : {}),
                timeoutMs: TURN_TIMEOUT_MS,
                signal: controller.signal,
                attach: attachThisTurn,
                ...(attachThisTurn ? { startedAt } : {}),
                consumption: { origin: "refinement", subject: doc.taskId },
            },
            { ...hooks, publish },
        )
        textOut = result.text || accumulated.text
        await flushWorkbenchEvents(id)
        if (result.outcome !== "succeeded") break
        // Só marca como esclarecido quando a especificação DESTE turno existe e foi gravada de fato.
        if (extractTechnicalSpec(textOut)) {
            try {
                specSaved = await saveSpec(doc.taskId, textOut, tolerance)
            } catch (error) {
                log.error({ err: errorText(error), taskId: doc.taskId }, "[refinement] falha ao salvar a especificação")
                specSaved = false
            }
            break
        }
        // Turno terminou sem a especificação: consolida automaticamente (sem novas perguntas), até o limite.
        if (attempt >= REFINEMENT_MAX_RECOVERY_ATTEMPTS) break
        log.warn({ refinementId: id, attempt }, `[refinement] ${doc.taskCode}: turno sem a especificação; consolidando`)
        await TaskRefinement.updateOne({ _id: id }, { $set: { finalizing: true, lastText: textOut, pendingForms: [], pendingPermissions: [] } })
        await publishRefinement(doc.taskId)
        prompt = withProtocol(buildRefinementFinalizePrompt())
    }

    const succeeded = result.outcome === "succeeded"
    const resolved = succeeded && specSaved
    // "Encerrar refinamento" durante o turno (OPE-137): o agente parou a pedido do dono; o refinamento fica
    // parado sem erro (conta como concluído pela marca `closedAt`).
    const closed = Boolean(((await TaskRefinement.findById(id).lean()) as { closedAt?: Date | null } | null)?.closedAt)
    const runState = succeeded || closed ? "idle" : result.outcome === "interrupted" ? "interrupted" : "failed"
    const error = resolved || closed
        ? null
        : succeeded
            ? extractTechnicalSpec(textOut)
                ? REFINEMENT_SPEC_SAVE_ERROR
                : REFINEMENT_SPEC_MISSING_ERROR
            : (result.message ?? "O agente não concluiu o refinamento")
    await TaskRefinement.updateOne({ _id: id }, { $set: { runState, resolved, finalizing: false, error, lastText: textOut, pendingForms: [], pendingPermissions: [] } })
    refinementRun(doc, { ok: succeeded, error: succeeded ? null : error, durationMs: result.durationMs ?? null, costUsd: result.costUsd ?? null })
    if (resolved) refinementMetric(doc, "refinement-completed", { dedupKey: `refinement-completed:${id}`, data: { durationMs: Date.now() - new Date(doc.startedAt ?? doc.createdAt ?? Date.now()).getTime() } })
    if (resolved) {
        log.info({ refinementId: id, costUsd: result.costUsd }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: concluído`)
        // Com a mesa no refinamento, a sessão fica para o "Continuar refinamento" (sai ao ir para o plano ou
        // ao excluir a mesa — `releaseRefinementSession`). Sem mesa, é excluída ao concluir, como antes.
        if (inRefinementStage(await linkedWorkbench(doc.taskId))) log.info({ refinementId: id }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: sessão mantida para a mesa de trabalho`)
        else await finishRefinementSession(id, sessionId)
    } else {
        log.warn({ refinementId: id, outcome: result.outcome, resolved }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: ${result.outcome}`)
    }
    await publishRefinement(doc.taskId)
}

interface LaunchOptions {
    fileIds?: string[]
    /** Texto do dono mostrado na saída (informações adicionais). */
    userText?: string | null
}

/** Dispara um turno em segundo plano (a rota responde na hora; a saída chega pelo stream). */
async function launchTurn(id: string, text: string, options: LaunchOptions = {}): Promise<void> {
    if (isWorkbenchActive(id)) throw new DomainError(409, "O agente já está refinando esta tarefa", "REFINEMENT_BUSY")
    const doc = await loadRefinement(id)
    await prepareHub(id)
    await publishUserInput(id, options.userText, options.fileIds)
    const controller = new AbortController()
    markWorkbenchActive(id, controller)
    try {
        // Turno novo começa um episódio novo: marca o início do turno e limpa a causa da parada e o
        // desfecho da reconexão anterior (o ciclo automático do cliente reinicia do zero).
        await TaskRefinement.updateOne({ _id: id }, { $set: { runState: "running", resolved: false, closedAt: null, queuedStart: null, finalizing: false, error: null, lastPrompt: { text }, heartbeatAt: new Date(), turnStartedAt: new Date(), stopRequestedAt: null, reconnect: null, pendingForms: [], pendingPermissions: [] } })
    } catch (error) {
        clearWorkbenchActive(id, controller)
        throw error
    }
    await publishRefinement(doc.taskId)
    void executeTurn(id, text, controller, { fileIds: options.fileIds })
        .catch(async (error) => {
            log.error({ err: errorText(error), refinementId: id }, "[refinement] falha inesperada no turno")
            await TaskRefinement.updateOne({ _id: id }, { $set: { runState: "failed", error: errorText(error), pendingForms: [], pendingPermissions: [] } }).catch(() => undefined)
        })
        .finally(() => {
            clearWorkbenchActive(id, controller)
            void publishRefinement(doc.taskId)
        })
}

export interface StartRefinementOptions {
    /** Sessões do refinamento anterior ainda pendentes de exclusão (Recomeçar). */
    carriedPending?: string[]
    /** Informações adicionais do dono (tela inicial da mesa): vão no primeiro prompt. */
    text?: string | null
    fileIds?: string[]
    /** Chamado pelo fluxo da mesa (OPE-137): a vaga e a etapa já foram decididas lá. */
    fromWorkbench?: boolean
    /**
     * "Refinar tarefa" sem vaga na central: grava o pedido e NÃO inicia o turno (a mesa abre pela fila).
     * `modelOverrides` são as trocas de modelo da tela inicial, aplicadas quando a mesa abrir.
     */
    queue?: { modelOverrides: Record<string, unknown> | null } | null
}

/** Inicia o refinamento da tarefa (idempotente: se já existir, devolve o estado). */
export async function startRefinement(taskId: string, options: StartRefinementOptions = {}): Promise<TaskRefinementStateDto> {
    const { settings } = await loadTaskRefinementSettings()
    const feature = await availabilityOfTaskRefinement(settings)
    if (!feature.available || !settings.model) throw new DomainError(409, feature.reason ?? "Refinar tarefa indisponível", "REFINEMENT_UNAVAILABLE")
    const task = await getTask(taskId)
    const central = await resolveCentral(task)
    if (!options.fromWorkbench) {
        const link = await linkedWorkbench(taskId)
        assertNotPastRefinement(link)
        // Mesa em "Especificação pronta" sem refinamento (excluído): recomeça pela mesa, que respeita a vaga.
        if (link?.stage === "spec_ready" && !(await findByTask(taskId))) {
            await delegateToWorkbench(link.id, "restart-refinement")
            return getRefinementState(taskId)
        }
    }
    const existing = await findByTask(taskId)
    if (existing) return getRefinementState(taskId)
    const carriedPending = options.carriedPending ?? []
    const text = options.text?.trim() || null
    const fileIds = options.fileIds ?? []

    let doc: ITaskRefinement
    try {
        doc = (
            await TaskRefinement.create({
                taskId,
                taskCode: task.code,
                taskTitle: task.title,
                projectId: central.projectId,
                centralId: central.centralId,
                sessionDirectory: central.directory,
                runState: "idle",
                resolved: false,
                pendingSessionDeletions: [...new Set(carriedPending)],
                ...(options.queue ? { queuedStart: { text, fileIds, modelOverrides: options.queue.modelOverrides, queuedAt: new Date() } } : {}),
            })
        ).toObject() as unknown as ITaskRefinement
    } catch (error) {
        if ((error as { code?: number }).code === 11000) return getRefinementState(taskId)
        throw error
    }
    await recordAudit({ userId: actorId(), entidade: REFINEMENT_AUDIT_ENTITY, entidadeId: String(doc._id), acao: AcaoAuditoria.CRIAR, depois: { tarefa: task.code, projeto: central.projectName, ...(options.queue ? { aguardandoVaga: true } : {}) } })
    refinementMetric(doc, "refinement-started", { dedupKey: `refinement-started:${String(doc._id)}`, data: { taskTitle: task.title } })
    // Pendências herdadas de um recomeço: tenta excluí-las já (nunca tocam a sessão nova).
    if (carriedPending.length) await flushRefinementSessionDeletions(String(doc._id), carriedPending).catch(() => undefined)
    if (options.queue) await publishRefinement(taskId)
    else await launchTurn(String(doc._id), buildRefinementPrompt(task, settings.include, text), { fileIds, userText: text })
    return getRefinementState(taskId)
}

/**
 * "Refinar tarefa" sem vaga (OPE-137): guarda o pedido no refinamento (cria um, se ainda não houver),
 * sem iniciar turno. A mesa abre em "Refinando" pela fila da central e consome o pedido.
 */
export async function queueRefinementStart(taskId: string, input: { text?: string | null; fileIds?: string[]; modelOverrides?: Record<string, unknown> | null }): Promise<TaskRefinementStateDto> {
    const existing = await findByTask(taskId)
    if (!existing) return startRefinement(taskId, { text: input.text, fileIds: input.fileIds, fromWorkbench: true, queue: { modelOverrides: input.modelOverrides ?? null } })
    await TaskRefinement.updateOne({ _id: existing._id }, { $set: { queuedStart: { text: input.text?.trim() || null, fileIds: input.fileIds ?? [], modelOverrides: input.modelOverrides ?? null, queuedAt: new Date() } } })
    await recordAudit({ userId: actorId(), entidade: REFINEMENT_AUDIT_ENTITY, entidadeId: String(existing._id), acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: existing.taskCode, aguardandoVaga: true } })
    await publishRefinement(taskId)
    return getRefinementState(taskId)
}

/** Lê e limpa o pedido guardado sem vaga (a mesa acabou de abrir pela fila). */
export async function takeQueuedRefinementStart(taskId: string): Promise<{ text: string | null; fileIds: string[]; modelOverrides: Record<string, unknown> | null } | null> {
    const doc = await findByTask(taskId)
    const queued = doc?.queuedStart ?? null
    if (!doc || !queued) return null
    await TaskRefinement.updateOne({ _id: doc._id }, { $set: { queuedStart: null } })
    return { text: queued.text ?? null, fileIds: queued.fileIds ?? [], modelOverrides: queued.modelOverrides ?? null }
}

/** Estado essencial do refinamento para o fluxo da mesa (sem DTO). */
export interface RefinementSnapshot {
    id: string
    concluded: boolean
    running: boolean
    liveChat: boolean
    /** Pedido guardado sem vaga (texto, anexos e modelos), consumido quando a mesa abre. */
    queuedStart: { text: string | null; fileIds: string[]; modelOverrides: Record<string, unknown> | null } | null
}

export async function refinementSnapshot(taskId: string): Promise<RefinementSnapshot | null> {
    const raw = await findByTask(taskId)
    if (!raw) return null
    const doc = await reconcile(raw)
    const id = String(doc._id)
    const queued = doc.queuedStart ?? null
    return {
        id,
        concluded: refinementConcluded({ resolved: doc.resolved === true, closed: Boolean(doc.closedAt) }),
        running: isWorkbenchActive(id),
        liveChat: await liveChatEnabled(doc.centralId),
        queuedStart: queued ? { text: queued.text ?? null, fileIds: queued.fileIds ?? [], modelOverrides: queued.modelOverrides ?? null } : null,
    }
}

/** Responde (`answer`) ou dispensa (`cancel`) a pergunta do agente. */
export async function replyRefinementForm(taskId: string, formId: string, input: FormReplyInput): Promise<TaskRefinementStateDto> {
    const doc = await findByTask(taskId)
    if (!doc) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
    if (!doc.sessionId || !(doc.pendingForms as { id?: string }[]).some((item) => item.id === formId)) throw new DomainError(404, "Pergunta não encontrada (já respondida?)", "FORM_NOT_FOUND")
    const client = await getOpencodeClient()
    const id = String(doc._id)
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
    await TaskRefinement.updateOne({ _id: doc._id }, { $pull: { pendingForms: { id: formId } } })
    await publishRefinement(taskId)
    return getRefinementState(taskId)
}

/** Responde um pedido de permissão do agente. */
export async function replyRefinementPermission(taskId: string, requestId: string, input: PermissionReplyInput): Promise<TaskRefinementStateDto> {
    const doc = await findByTask(taskId)
    if (!doc) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
    if (!doc.sessionId || !(doc.pendingPermissions as { id?: string }[]).some((item) => item.id === requestId)) throw new DomainError(404, "Pedido de permissão não encontrado (já respondido?)", "PERMISSION_NOT_FOUND")
    const client = await getOpencodeClient()
    const id = String(doc._id)
    await client.permission.reply({ sessionID: doc.sessionId, requestID: requestId, decision: input.decision, ...(input.message ? { message: input.message } : {}) })
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "permission-replied", id: requestId, decision: input.decision })
    await TaskRefinement.updateOne({ _id: doc._id }, { $pull: { pendingPermissions: { id: requestId } } })
    await publishRefinement(taskId)
    return getRefinementState(taskId)
}

/** Chat durante a execução: mensagem do usuário que entra no turno de refinamento em andamento (sem interromper). */
export async function sendRefinementMessage(taskId: string, text: string, fileIds?: string[]): Promise<TaskRefinementStateDto> {
    const doc = await findByTask(taskId)
    if (!doc) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
    const id = String(doc._id)
    if (!isWorkbenchActive(id)) throw new DomainError(409, "O agente não está refinando agora: use Continuar", "REFINEMENT_NOT_RUNNING")
    // Consolidando a especificação final: a mensagem se misturaria ao resultado.
    if (doc.finalizing) throw new DomainError(409, "O agente está consolidando a especificação: aguarde terminar", "REFINEMENT_FINALIZING")
    const attachments = fileIds?.length ? await liveFiles(doc.taskCode, fileIds) : undefined
    const target = { runId: id, centralId: doc.centralId, label: "o refinamento", audit: { entidade: REFINEMENT_AUDIT_ENTITY, contexto: { tarefa: doc.taskCode } } }
    if (attachments) await deliverLiveMessage(target, text, attachments)
    else await deliverLiveMessage(target, text)
    return getRefinementState(taskId)
}

/** Anexos de uma mensagem do chat ao vivo (módulo de arquivos sob demanda). */
async function liveFiles(taskCode: string, fileIds: string[]) {
    const [{ liveAttachments, loadClaimableFiles }, { agenticDownloadDir }] = await Promise.all([import("@/features/agentic/server/files"), import("@/features/agentic/files")])
    return liveAttachments(await loadClaimableFiles(fileIds, null), agenticDownloadDir(taskCode))
}

/** Interrompe o turno em andamento (botão Parar). */
export async function interruptRefinement(taskId: string): Promise<TaskRefinementStateDto> {
    const doc = await findByTask(taskId)
    if (!doc) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
    const id = String(doc._id)
    // Registra a intenção ANTES de abortar: a interrupção pedida pelo usuário nunca dispara a
    // reconexão automática (ao contrário das perdas por queda/reinício).
    await TaskRefinement.updateOne({ _id: doc._id }, { $set: { stopRequestedAt: new Date() } })
    if (!isWorkbenchActive(id)) {
        await reconcile(doc)
        return getRefinementState(taskId)
    }
    if (doc.sessionId) await (await getOpencodeClient()).session.interrupt({ sessionID: doc.sessionId }).catch(() => undefined)
    abortWorkbenchRun(id, "Interrompido pelo usuário")
    log.warn({ refinementId: id }, `Refinamento ${doc.taskCode}: interrompido pelo usuário`)
    return getRefinementState(taskId)
}

/**
 * Reconecta ao turno em andamento na MESMA sessão do OpenCode: acompanha sem reenviar prompt e sem
 * trocar agente/modelo, restaura perguntas/permissões pendentes e, se a execução já terminou durante
 * a queda, recupera o resultado e fecha o turno (especificação, consolidação automática, falha).
 * A rota responde na hora: a resposta já diz se há (ou não) execução para acompanhar.
 */
export async function reconnectRefinement(taskId: string): Promise<TaskRefinementStateDto> {
    const found = await findByTask(taskId)
    if (!found) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
    const doc = await reconcile(found)
    const id = String(doc._id)
    // Já há um turno vivo neste processo acompanhando o refinamento: nada a reconectar.
    if (isWorkbenchActive(id)) return getRefinementState(taskId)
    if (!doc.sessionId) throw new DomainError(409, "Este refinamento não tem uma sessão do OpenCode para reconectar (use Continuar)", "REFINEMENT_NO_SESSION")
    if (doc.runState !== "failed" && doc.runState !== "interrupted") throw new DomainError(409, "O refinamento não está falho nem interrompido para reconectar", "REFINEMENT_INVALID_STATE")
    const task = await getTask(doc.taskId)
    const availability = await availabilityFor(task)
    if (!availability.available) throw new DomainError(409, availability.reason ?? "Refinar tarefa indisponível", "REFINEMENT_UNAVAILABLE")
    await prepareHub(id)
    const startedAt = doc.turnStartedAt ? new Date(doc.turnStartedAt).getTime() : 0
    const probe = await probeReconnect(doc.sessionId, startedAt)
    await TaskRefinement.updateOne({ _id: doc._id }, { $set: { reconnect: { outcome: probe.outcome, message: probe.message, at: new Date() } } })
    await publishRefinement(doc.taskId)
    if (!probe.follow) return getRefinementState(taskId)
    await launchAttachTurn(id, doc)
    return getRefinementState(taskId)
}

/** Acompanha em segundo plano a sessão existente (attach), sem criar sessão nem enviar prompt. */
async function launchAttachTurn(id: string, doc: ITaskRefinement): Promise<void> {
    if (isWorkbenchActive(id)) throw new DomainError(409, "O agente já está refinando esta tarefa", "REFINEMENT_BUSY")
    const controller = new AbortController()
    markWorkbenchActive(id, controller)
    try {
        // Preserva a sessão, o marco do turno, a causa da parada e as pendências (o turno é o mesmo).
        await TaskRefinement.updateOne({ _id: id }, { $set: { runState: "running", finalizing: false, error: null, heartbeatAt: new Date() } })
    } catch (error) {
        clearWorkbenchActive(id, controller)
        throw error
    }
    await publishRefinement(doc.taskId)
    void executeTurn(id, "", controller, { attach: true })
        .catch(async (error) => {
            log.error({ err: errorText(error), refinementId: id }, "[refinement] falha inesperada na reconexão")
            await TaskRefinement.updateOne({ _id: id }, { $set: { runState: "failed", error: errorText(error), pendingForms: [], pendingPermissions: [] } }).catch(() => undefined)
        })
        .finally(() => {
            clearWorkbenchActive(id, controller)
            void publishRefinement(doc.taskId)
        })
}

export interface ContinueRefinementOptions {
    /** Informações adicionais do dono que entram no prompt da retomada. */
    text?: string | null
    fileIds?: string[]
    /** Chamado pelo fluxo da mesa (OPE-137): a vaga e a etapa já foram decididas lá. */
    fromWorkbench?: boolean
}

/**
 * Retoma o refinamento na mesma conversa: interrompido/falho retoma o esclarecimento; encerrado sem a
 * especificação apenas consolida; concluído ou encerrado na mesa volta a refinar (OPE-137); sem a sessão
 * anterior (excluída ao concluir na página da tarefa), reenvia a tarefa com a especificação atual; e um
 * pedido que aguardava vaga (nenhum turno ainda) começa pelo primeiro prompt.
 */
export async function continueRefinement(taskId: string, options: ContinueRefinementOptions = {}): Promise<TaskRefinementStateDto> {
    const doc = await findByTask(taskId)
    if (!doc) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
    if (isWorkbenchActive(String(doc._id))) throw new DomainError(409, "O agente já está refinando esta tarefa", "REFINEMENT_BUSY")
    if (!options.fromWorkbench) {
        const link = await linkedWorkbench(taskId)
        assertNotPastRefinement(link)
        // "Especificação pronta" não ocupa vaga: voltar a refinar passa pela mesa (fila da central).
        if (link?.stage === "spec_ready") {
            await delegateToWorkbench(link.id, "continue-refinement")
            return getRefinementState(taskId)
        }
    }
    const { settings } = await loadTaskRefinementSettings()
    const task = await getTask(taskId)
    const text = options.text?.trim() || null
    let prompt: string
    // Nenhum turno ainda (o pedido aguardou vaga): começa pelo primeiro prompt.
    const neverRan = !doc.turnStartedAt && !doc.lastPrompt && !doc.sessionId
    if (neverRan) prompt = buildRefinementPrompt(task, settings.include, text)
    else {
        const concluded = refinementConcluded({ resolved: doc.resolved === true, closed: Boolean(doc.closedAt) })
        const base = !doc.sessionId ? buildRefinementFreshContinuePrompt(task, settings.include) : concluded ? buildRefinementReopenPrompt() : doc.runState === "idle" ? buildRefinementFinalizePrompt() : buildRefinementResumePrompt()
        prompt = withAdditionalInfo(base, text)
    }
    await launchTurn(String(doc._id), prompt, { fileIds: options.fileIds, userText: text })
    return getRefinementState(taskId)
}

/**
 * "Encerrar refinamento" (OPE-137, só com a mesa em "Refinando"): para o agente, dispensa as perguntas
 * abertas e marca o refinamento como encerrado — a mesa vai para "Especificação pronta", mesmo sem
 * especificação. A especificação já salva na tarefa é mantida.
 */
export async function closeRefinement(taskId: string): Promise<TaskRefinementStateDto> {
    const doc = await findByTask(taskId)
    if (!doc) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
    const link = await linkedWorkbench(taskId)
    if (link?.stage !== "refining") throw new DomainError(409, "Encerrar o refinamento só vale com a mesa de trabalho em Refinando", "REFINEMENT_CLOSE_UNAVAILABLE")
    const id = String(doc._id)
    const now = new Date()
    // A marca vem ANTES de abortar: o fim do turno lê `closedAt` e fecha sem erro.
    await TaskRefinement.updateOne({ _id: doc._id }, { $set: { closedAt: now, stopRequestedAt: now } })
    if (doc.sessionId) {
        const client = await getOpencodeClient().catch(() => null)
        const sessionId = doc.sessionId
        for (const form of (doc.pendingForms ?? []) as { id?: string }[]) {
            if (form.id) await client?.session.form.cancel({ sessionID: sessionId, formID: form.id }).catch(() => undefined)
        }
        if (isWorkbenchActive(id)) await client?.session.interrupt({ sessionID: sessionId }).catch(() => undefined)
    }
    if (isWorkbenchActive(id)) abortWorkbenchRun(id, "Refinamento encerrado pelo usuário")
    else await TaskRefinement.updateOne({ _id: doc._id }, { $set: { runState: "idle", finalizing: false, error: null, pendingForms: [], pendingPermissions: [] } })
    await recordAudit({ userId: actorId(), entidade: REFINEMENT_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { tarefa: doc.taskCode, encerrado: false }, depois: { tarefa: doc.taskCode, encerrado: true } })
    log.info({ refinementId: id }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: encerrado pelo usuário`)
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "notice", level: "info", message: "Refinamento encerrado. A especificação já salva foi mantida." })
    await publishRefinement(taskId)
    return getRefinementState(taskId)
}

/**
 * A mesa saiu do refinamento (foi para o planejamento, foi concluída ou excluída — OPE-137): a sessão do
 * OpenCode do refinamento é desvinculada e excluída, com a mesma regra de exclusão pendente de hoje.
 */
export async function releaseRefinementSession(taskId: string): Promise<void> {
    const doc = await findByTask(taskId)
    if (!doc) return
    if (!doc.sessionId) {
        await publishRefinement(taskId)
        return
    }
    const id = String(doc._id)
    if (isWorkbenchActive(id)) {
        await (await getOpencodeClient()).session.interrupt({ sessionID: doc.sessionId }).catch(() => undefined)
        abortWorkbenchRun(id, "A mesa de trabalho saiu do refinamento")
    }
    await finishRefinementSession(id, doc.sessionId)
    await publishRefinement(taskId)
}

/**
 * Apaga o refinamento da tarefa e a saída gravada. Devolve os ids de sessão que continuaram pendentes
 * de exclusão (para serem levados ao novo refinamento, quando houver recomeço).
 */
async function destroyRefinement(doc: ITaskRefinement): Promise<string[]> {
    const id = String(doc._id)
    if (isWorkbenchActive(id)) {
        if (doc.sessionId) await (await getOpencodeClient()).session.interrupt({ sessionID: doc.sessionId }).catch(() => undefined)
        abortWorkbenchRun(id, "Refinamento recomeçado")
    }
    // A sessão atual também sai (Recomeçar abre outra conversa; com a mesa, ela não é mais excluída ao concluir).
    const pending = [...new Set([...(doc.pendingSessionDeletions ?? []), doc.sessionId].filter((value): value is string => typeof value === "string" && Boolean(value)))]
    const remaining = pending.length ? await flushRefinementSessionDeletions(id, pending).catch(() => pending) : []
    await dropWorkbenchEvents(id)
    // Anexos de um pedido que aguardava vaga (dono provisório do refinamento).
    if (doc.queuedStart?.fileIds?.length) await import("@/features/agentic/server/files").then((files) => files.deleteWorkbenchFiles(refinementFilesOwner(id))).catch(() => undefined)
    await TaskRefinement.deleteOne({ _id: doc._id })
    // Refinamento apagado antes da especificação final: abandonado (Agente Refinador: % concluídos).
    if (!doc.resolved) refinementMetric(doc, "refinement-abandoned", { dedupKey: `refinement-abandoned:${id}`, data: { runState: doc.runState } })
    return remaining
}

/** Recomeça do zero: apaga o refinamento e abre uma nova sessão (levando as exclusões pendentes). */
export async function restartRefinement(taskId: string, options: { fromWorkbench?: boolean } = {}): Promise<TaskRefinementStateDto> {
    if (!options.fromWorkbench) {
        const link = await linkedWorkbench(taskId)
        assertNotPastRefinement(link)
        if (link?.stage === "spec_ready") {
            await delegateToWorkbench(link.id, "restart-refinement")
            return getRefinementState(taskId)
        }
    }
    const doc = await findByTask(taskId)
    let carried: string[] = []
    if (doc) {
        carried = await destroyRefinement(doc)
        await recordAudit({ userId: actorId(), entidade: REFINEMENT_AUDIT_ENTITY, entidadeId: String(doc._id), acao: AcaoAuditoria.EXCLUIR, antes: { tarefa: doc.taskCode, motivo: "recomeço" } })
        await publishRefinement(taskId)
    }
    return startRefinement(taskId, { carriedPending: carried, fromWorkbench: options.fromWorkbench })
}

/** Exclui o refinamento da tarefa (botão Excluir). */
export async function deleteRefinement(taskId: string): Promise<void> {
    const doc = await findByTask(taskId)
    if (!doc) return
    await destroyRefinement(doc)
    await recordAudit({ userId: actorId(), entidade: REFINEMENT_AUDIT_ENTITY, entidadeId: String(doc._id), acao: AcaoAuditoria.EXCLUIR, antes: { tarefa: doc.taskCode } })
    await publishRefinement(taskId)
}

/** Limpeza ao excluir a tarefa (melhor esforço). */
export async function deleteRefinementForTask(taskId: string): Promise<void> {
    await deleteRefinement(taskId).catch(() => undefined)
}
