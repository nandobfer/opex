import { isValidObjectId } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { TaskRefinement, type ITaskRefinement } from "@/lib/db/models/Refinement"
import { AgenticCentral } from "@/lib/db/models/Agentic"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import type { OpencodeFormDto, OpencodePermissionDto } from "@/lib/ai/opencode-events"
import { runAgentTurn } from "@/lib/ai/opencode-run"
import { publishAppEvent } from "@/lib/pusher/channels"
import { loggerFor } from "@/lib/logger"
import { getLocalUser } from "@/lib/local-user"
import { parseCentralConfig } from "@/features/agentic/logic"
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
import { REFINEMENT_AUDIT_ENTITY, REFINEMENT_INSTRUCTIONS_KEY, REFINEMENT_MAX_RECOVERY_ATTEMPTS, REFINEMENT_SPEC_MISSING_ERROR, REFINEMENT_SPEC_SAVE_ERROR, REFINEMENT_STAGE_LABEL, REFINEMENT_UPDATED_EVENT } from "../constants"
import { extractTechnicalSpec } from "../logic"
import { buildRefinementFinalizePrompt, buildRefinementInstructions, buildRefinementPrompt, buildRefinementResumePrompt } from "../prompt"
import { deleteRefinementSession, flushRefinementSessionDeletions } from "./session-cleanup"
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
    const error = "A execução foi perdida (o app reiniciou durante o turno). Use Continuar."
    await TaskRefinement.updateOne({ _id: doc._id, runState: "running" }, { $set: { runState: "interrupted", finalizing: false, error, pendingForms: [], pendingPermissions: [] } })
    return { ...doc, runState: "interrupted", finalizing: false, error, pendingForms: [], pendingPermissions: [] }
}

function toRefinementDto(doc: ITaskRefinement): TaskRefinementDto {
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
        finalizing: doc.finalizing === true,
        error: doc.error ?? null,
        spec: doc.spec ?? null,
        pendingForms: (doc.pendingForms ?? []) as OpencodeFormDto[],
        pendingPermissions: (doc.pendingPermissions ?? []) as OpencodePermissionDto[],
        usage: { costUsd: doc.usage?.costUsd ?? 0, inputTokens: doc.usage?.inputTokens ?? 0, outputTokens: doc.usage?.outputTokens ?? 0, reasoningTokens: doc.usage?.reasoningTokens ?? 0 },
        startedAt: iso(doc.startedAt) ?? new Date().toISOString(),
        updatedAt: iso(doc.updatedAt) ?? new Date().toISOString(),
    }
}

async function publishRefinement(taskId: string): Promise<void> {
    await publishAppEvent(REFINEMENT_UPDATED_EVENT, { taskId }).catch(() => undefined)
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
    if (!central) throw new DomainError(409, `Crie uma central de desenvolvimento para ${task.project.name} em Integrações › Provedores de IA`, "CENTRAL_NOT_FOUND")
    const config = parseCentralConfig(central.config)
    if (!config.enabled) throw new DomainError(409, `A central de desenvolvimento de ${central.projectName} está desativada`, "CENTRAL_DISABLED")
    return { centralId: String(central._id), projectId: central.projectId, projectName: central.projectName, directory: config.sessionDirectory }
}

async function availabilityFor(task: Awaited<ReturnType<typeof getTask>>): Promise<RefinementAvailability> {
    const { settings } = await loadTaskRefinementSettings()
    const feature = await availabilityOfTaskRefinement(settings)
    if (!feature.available) return { ...feature, centralId: null, sessionDirectory: null }
    if (!task.project?.id) return { available: false, reason: "A tarefa não tem repositório (projeto) vinculado", centralId: null, sessionDirectory: null }
    await dbConnect()
    const central = await AgenticCentral.findOne({ projectId: task.project.id }).lean()
    if (!central) return { available: false, reason: `Crie uma central de desenvolvimento para ${task.project.name} em Integrações › Provedores de IA`, centralId: null, sessionDirectory: null }
    const config = parseCentralConfig(central.config)
    if (!config.enabled) return { available: false, reason: `A central de desenvolvimento de ${central.projectName} está desativada`, centralId: String(central._id), sessionDirectory: config.sessionDirectory }
    return { available: true, reason: null, centralId: String(central._id), sessionDirectory: config.sessionDirectory }
}

/** Estado do refinamento da tarefa (com a disponibilidade para o botão). */
export async function getRefinementState(taskId: string): Promise<TaskRefinementStateDto> {
    const task = await getTask(taskId)
    const raw = await findByTask(taskId)
    const doc = raw ? await reconcile(raw) : null
    return { refinement: doc ? toRefinementDto(doc) : null, availability: await availabilityFor(task) }
}

/**
 * Grava a especificação extraída do texto do agente em `technicalSpec` da tarefa. Devolve `true`
 * quando a especificação existe e está gravada (inclusive se já era a mesma) e `false` quando o texto
 * não traz a especificação. Uma falha ao gravar é propagada, para o turno não marcar como esclarecido
 * sem persistir.
 */
async function saveSpec(taskId: string, text: string): Promise<boolean> {
    const spec = extractTechnicalSpec(text)
    if (!spec) return false
    const current = await TaskRefinement.findOne({ taskId }).select({ spec: 1 }).lean()
    if ((current as { spec?: string | null } | null)?.spec === spec) return true
    await updateTask(taskId, { technicalSpec: spec }, actorId())
    await TaskRefinement.updateOne({ taskId }, { $set: { spec } })
    return true
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
    return {
        hooks: {
            onPermission: async (permission: OpencodePermissionDto) => {
                await TaskRefinement.updateOne(filter, { $push: { pendingPermissions: permission } })
                await changed()
            },
            onPermissionClosed: async (requestId: string) => {
                await TaskRefinement.updateOne(filter, { $pull: { pendingPermissions: { id: requestId } } })
                await changed()
            },
            onForm: async (form: OpencodeFormDto) => {
                await TaskRefinement.updateOne(filter, { $push: { pendingForms: form } })
                // Rodada concluída: a especificação atualizada é gravada na tarefa.
                await saveSpec(doc.taskId, accumulated.text).catch((error) => log.warn({ err: errorText(error), taskId: doc.taskId }, "[refinement] falha ao salvar a especificação"))
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
 */
async function executeTurn(id: string, text: string, controller: AbortController): Promise<void> {
    const doc = await loadRefinement(id)
    const task = await getTask(doc.taskId)
    const { settings } = await loadTaskRefinementSettings()
    const central = await resolveCentral(task)
    const client = await getOpencodeClient()
    const sessionId = await ensureSession(client, doc, doc.sessionDirectory ?? central.directory)
    const instructions = buildRefinementInstructions(settings)
    const instructionsApplied = await applyInstructions(client, sessionId, instructions)
    // Sem a entrada durável (servidor sem suporte), o protocolo vai no início de cada prompt.
    const withProtocol = (prompt: string) => (instructionsApplied ? prompt : `${instructions}\n\n---\n${prompt}`)
    // O runner genérico emite os eventos via `publish`; sem isto a saída não chega ao stream.
    const publish = (event: WorkbenchEventPayload) => publishWorkbenchEvent(id, event)

    let prompt = withProtocol(text)
    let result: Awaited<ReturnType<typeof runAgentTurn>> = { outcome: "failed", text: "", message: null, costUsd: 0, durationMs: 0 }
    let textOut = ""
    let specSaved = false
    for (let attempt = 0; ; attempt++) {
        const { hooks, accumulated } = turnHooks(doc)
        log.info({ refinementId: id, agent: settings.agent, model: settings.model, attempt }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: turno iniciado`)
        result = await runAgentTurn(
            client,
            { id, sessionId, stage: REFINEMENT_STAGE_LABEL, title: REFINEMENT_STAGE_LABEL, agent: { agent: settings.agent, model: settings.model, variant: settings.variant }, text: prompt, timeoutMs: TURN_TIMEOUT_MS, signal: controller.signal },
            { ...hooks, publish },
        )
        textOut = result.text || accumulated.text
        await flushWorkbenchEvents(id)
        if (result.outcome !== "succeeded") break
        // Só marca como esclarecido quando a especificação DESTE turno existe e foi gravada de fato.
        if (extractTechnicalSpec(textOut)) {
            try {
                specSaved = await saveSpec(doc.taskId, textOut)
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
    const runState = succeeded ? "idle" : result.outcome === "interrupted" ? "interrupted" : "failed"
    const error = resolved
        ? null
        : succeeded
            ? extractTechnicalSpec(textOut)
                ? REFINEMENT_SPEC_SAVE_ERROR
                : REFINEMENT_SPEC_MISSING_ERROR
            : (result.message ?? "O agente não concluiu o refinamento")
    await TaskRefinement.updateOne({ _id: id }, { $set: { runState, resolved, finalizing: false, error, lastText: textOut, pendingForms: [], pendingPermissions: [] } })
    if (resolved) {
        log.info({ refinementId: id, costUsd: result.costUsd }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: concluído`)
        await finishRefinementSession(id, sessionId)
    } else {
        log.warn({ refinementId: id, outcome: result.outcome, resolved }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: ${result.outcome}`)
    }
    await publishRefinement(doc.taskId)
}

/** Dispara um turno em segundo plano (a rota responde na hora; a saída chega pelo stream). */
async function launchTurn(id: string, text: string): Promise<void> {
    if (isWorkbenchActive(id)) throw new DomainError(409, "O agente já está refinando esta tarefa", "REFINEMENT_BUSY")
    const doc = await loadRefinement(id)
    await prepareHub(id)
    const controller = new AbortController()
    markWorkbenchActive(id, controller)
    try {
        await TaskRefinement.updateOne({ _id: id }, { $set: { runState: "running", resolved: false, finalizing: false, error: null, lastPrompt: { text }, heartbeatAt: new Date(), pendingForms: [], pendingPermissions: [] } })
    } catch (error) {
        clearWorkbenchActive(id, controller)
        throw error
    }
    await publishRefinement(doc.taskId)
    void executeTurn(id, text, controller)
        .catch(async (error) => {
            log.error({ err: errorText(error), refinementId: id }, "[refinement] falha inesperada no turno")
            await TaskRefinement.updateOne({ _id: id }, { $set: { runState: "failed", error: errorText(error), pendingForms: [], pendingPermissions: [] } }).catch(() => undefined)
        })
        .finally(() => {
            clearWorkbenchActive(id, controller)
            void publishRefinement(doc.taskId)
        })
}

/** Inicia o refinamento da tarefa (idempotente: se já existir, devolve o estado). */
export async function startRefinement(taskId: string, carriedPending: string[] = []): Promise<TaskRefinementStateDto> {
    const { settings } = await loadTaskRefinementSettings()
    const feature = await availabilityOfTaskRefinement(settings)
    if (!feature.available || !settings.model) throw new DomainError(409, feature.reason ?? "Refinar tarefa indisponível", "REFINEMENT_UNAVAILABLE")
    const task = await getTask(taskId)
    const central = await resolveCentral(task)
    const existing = await findByTask(taskId)
    if (existing) return getRefinementState(taskId)

    let doc: ITaskRefinement
    try {
        doc = (await TaskRefinement.create({ taskId, taskCode: task.code, taskTitle: task.title, projectId: central.projectId, centralId: central.centralId, sessionDirectory: central.directory, runState: "idle", resolved: false, pendingSessionDeletions: [...new Set(carriedPending)] })).toObject() as unknown as ITaskRefinement
    } catch (error) {
        if ((error as { code?: number }).code === 11000) return getRefinementState(taskId)
        throw error
    }
    await recordAudit({ userId: actorId(), entidade: REFINEMENT_AUDIT_ENTITY, entidadeId: String(doc._id), acao: AcaoAuditoria.CRIAR, depois: { tarefa: task.code, projeto: central.projectName } })
    // Pendências herdadas de um recomeço: tenta excluí-las já (nunca tocam a sessão nova).
    if (carriedPending.length) await flushRefinementSessionDeletions(String(doc._id), carriedPending).catch(() => undefined)
    await launchTurn(String(doc._id), buildRefinementPrompt(task, settings.include))
    return getRefinementState(taskId)
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

/** Interrompe o turno em andamento (botão Parar). */
export async function interruptRefinement(taskId: string): Promise<TaskRefinementStateDto> {
    const doc = await findByTask(taskId)
    if (!doc) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
    const id = String(doc._id)
    if (!isWorkbenchActive(id)) {
        await reconcile(doc)
        return getRefinementState(taskId)
    }
    if (doc.sessionId) await (await getOpencodeClient()).session.interrupt({ sessionID: doc.sessionId }).catch(() => undefined)
    abortWorkbenchRun(id, "Interrompido pelo usuário")
    log.warn({ refinementId: id }, `Refinamento ${doc.taskCode}: interrompido pelo usuário`)
    return getRefinementState(taskId)
}

/** Retoma um refinamento interrompido/falho ou encerrado sem a especificação (mesma sessão). */
export async function continueRefinement(taskId: string): Promise<TaskRefinementStateDto> {
    const doc = await findByTask(taskId)
    if (!doc) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
    if (isWorkbenchActive(String(doc._id))) throw new DomainError(409, "O agente já está refinando esta tarefa", "REFINEMENT_BUSY")
    // Encerrou sem a especificação (idle): apenas consolida. Interrompido/falho: retoma o esclarecimento.
    const finalize = doc.runState === "idle" && !doc.resolved
    await launchTurn(String(doc._id), finalize ? buildRefinementFinalizePrompt() : buildRefinementResumePrompt())
    return getRefinementState(taskId)
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
    const pending = [...new Set((doc.pendingSessionDeletions ?? []).filter((value) => typeof value === "string" && value))]
    const remaining = pending.length ? await flushRefinementSessionDeletions(id, pending).catch(() => pending) : []
    await dropWorkbenchEvents(id)
    await TaskRefinement.deleteOne({ _id: doc._id })
    return remaining
}

/** Recomeça do zero: apaga o refinamento e abre uma nova sessão (levando as exclusões pendentes). */
export async function restartRefinement(taskId: string): Promise<TaskRefinementStateDto> {
    const doc = await findByTask(taskId)
    let carried: string[] = []
    if (doc) {
        carried = await destroyRefinement(doc)
        await recordAudit({ userId: actorId(), entidade: REFINEMENT_AUDIT_ENTITY, entidadeId: String(doc._id), acao: AcaoAuditoria.EXCLUIR, antes: { tarefa: doc.taskCode, motivo: "recomeço" } })
        await publishRefinement(taskId)
    }
    return startRefinement(taskId, carried)
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
