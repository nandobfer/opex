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
import { REFINEMENT_AUDIT_ENTITY, REFINEMENT_STAGE_LABEL, REFINEMENT_UPDATED_EVENT } from "../constants"
import { extractTechnicalSpec } from "../logic"
import { buildRefinementPrompt } from "../prompt"
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
const TURN_TIMEOUT_MS = 60 * 60_000

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
    await TaskRefinement.updateOne({ _id: doc._id, runState: "running" }, { $set: { runState: "interrupted", error, pendingForms: [], pendingPermissions: [] } })
    return { ...doc, runState: "interrupted", error, pendingForms: [], pendingPermissions: [] }
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

/** Salva a especificação extraída do texto do agente no campo `technicalSpec` da tarefa. */
async function saveSpec(taskId: string, text: string): Promise<void> {
    const spec = extractTechnicalSpec(text)
    if (!spec) return
    const current = await TaskRefinement.findOne({ taskId }).select({ spec: 1 }).lean()
    if ((current as { spec?: string | null } | null)?.spec === spec) return
    await updateTask(taskId, { technicalSpec: spec }, actorId())
    await TaskRefinement.updateOne({ taskId }, { $set: { spec } })
}

/** Id do refinamento da tarefa (para o stream de eventos). `null` quando não há. */
export async function refinementIdForTask(taskId: string): Promise<string | null> {
    const doc = await findByTask(taskId)
    return doc ? String(doc._id) : null
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

/** Executa o turno em segundo plano: garante a sessão, roda o agente e grava o resultado. */
async function executeTurn(id: string, text: string, controller: AbortController): Promise<void> {
    const doc = await loadRefinement(id)
    const task = await getTask(doc.taskId)
    const { settings } = await loadTaskRefinementSettings()
    const central = await resolveCentral(task)
    const client = await getOpencodeClient()
    const sessionId = await ensureSession(client, doc, doc.sessionDirectory ?? central.directory)
    const { hooks, accumulated } = turnHooks(doc)
    log.info({ refinementId: id, agent: settings.agent, model: settings.model }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: turno iniciado`)
    const result = await runAgentTurn(
        client,
        { id, sessionId, stage: REFINEMENT_STAGE_LABEL, title: REFINEMENT_STAGE_LABEL, agent: { agent: settings.agent, model: settings.model, variant: settings.variant }, text, timeoutMs: TURN_TIMEOUT_MS, signal: controller.signal },
        hooks,
    )
    await flushWorkbenchEvents(id)
    await saveSpec(doc.taskId, result.text || accumulated.text).catch((error) => log.warn({ err: errorText(error), taskId: doc.taskId }, "[refinement] falha ao salvar a especificação"))
    const runState = result.outcome === "succeeded" ? "idle" : result.outcome === "interrupted" ? "interrupted" : "failed"
    const resolved = result.outcome === "succeeded"
    await TaskRefinement.updateOne({ _id: id }, { $set: { runState, resolved, error: result.outcome === "succeeded" ? null : (result.message ?? "O agente não concluiu o refinamento"), lastText: result.text || accumulated.text, pendingForms: [], pendingPermissions: [] } })
    if (result.outcome === "succeeded") log.info({ refinementId: id, costUsd: result.costUsd }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: concluído`)
    else log.warn({ refinementId: id, outcome: result.outcome }, `${REFINEMENT_STAGE_LABEL} ${doc.taskCode}: ${result.outcome}`)
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
        await TaskRefinement.updateOne({ _id: id }, { $set: { runState: "running", resolved: false, error: null, lastPrompt: { text }, heartbeatAt: new Date(), pendingForms: [], pendingPermissions: [] } })
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
export async function startRefinement(taskId: string): Promise<TaskRefinementStateDto> {
    const { settings } = await loadTaskRefinementSettings()
    const feature = await availabilityOfTaskRefinement(settings)
    if (!feature.available || !settings.model) throw new DomainError(409, feature.reason ?? "Refinar tarefa indisponível", "REFINEMENT_UNAVAILABLE")
    const task = await getTask(taskId)
    const central = await resolveCentral(task)
    const existing = await findByTask(taskId)
    if (existing) return getRefinementState(taskId)

    let doc: ITaskRefinement
    try {
        doc = (await TaskRefinement.create({ taskId, taskCode: task.code, taskTitle: task.title, projectId: central.projectId, centralId: central.centralId, sessionDirectory: central.directory, runState: "idle", resolved: false })).toObject() as unknown as ITaskRefinement
    } catch (error) {
        if ((error as { code?: number }).code === 11000) return getRefinementState(taskId)
        throw error
    }
    await recordAudit({ userId: actorId(), entidade: REFINEMENT_AUDIT_ENTITY, entidadeId: String(doc._id), acao: AcaoAuditoria.CRIAR, depois: { tarefa: task.code, projeto: central.projectName } })
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

/** Retoma um refinamento interrompido/falho no mesmo turno (mesma sessão). */
export async function continueRefinement(taskId: string): Promise<TaskRefinementStateDto> {
    const doc = await findByTask(taskId)
    if (!doc) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
    if (isWorkbenchActive(String(doc._id))) throw new DomainError(409, "O agente já está refinando esta tarefa", "REFINEMENT_BUSY")
    await launchTurn(String(doc._id), "Retome o refinamento de onde parou: faça as perguntas que faltarem e reescreva a especificação técnica completa.")
    return getRefinementState(taskId)
}

/** Apaga o refinamento da tarefa e a saída gravada. */
async function destroyRefinement(doc: ITaskRefinement): Promise<void> {
    const id = String(doc._id)
    if (isWorkbenchActive(id)) {
        if (doc.sessionId) await (await getOpencodeClient()).session.interrupt({ sessionID: doc.sessionId }).catch(() => undefined)
        abortWorkbenchRun(id, "Refinamento recomeçado")
    }
    await dropWorkbenchEvents(id)
    await TaskRefinement.deleteOne({ _id: doc._id })
}

/** Recomeça do zero: apaga o refinamento e abre uma nova sessão. */
export async function restartRefinement(taskId: string): Promise<TaskRefinementStateDto> {
    const doc = await findByTask(taskId)
    if (doc) {
        await destroyRefinement(doc)
        await recordAudit({ userId: actorId(), entidade: REFINEMENT_AUDIT_ENTITY, entidadeId: String(doc._id), acao: AcaoAuditoria.EXCLUIR, antes: { tarefa: doc.taskCode, motivo: "recomeço" } })
        await publishRefinement(taskId)
    }
    return startRefinement(taskId)
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
