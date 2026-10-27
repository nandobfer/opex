import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import type { OpencodeTokenUsage } from "@/lib/ai/opencode-events"
import { runAgentTurn, type TurnResult } from "@/lib/ai/opencode-run"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { flushWorkbenchEvents, publishWorkbenchEvent } from "@/features/agentic/server/hub"
import { fallbackNotice, runWithFallback } from "@/features/agentic/server/model-fallback"
import type { WorkbenchEventPayload } from "@/features/agentic/types"
import { getTask } from "@/features/tasks/server/service"
import type { TaskDetailDto } from "@/features/tasks/types"
import { tagLabel } from "@/features/tasks/tags"
import { agentMemoryTexts } from "@/features/ai/server/agent-memory-service"
import { loadTaskTagsSettings } from "@/features/ai/server/settings"
import { ADVERSARIAL_AUDIT_ENTITY, ADVERSARIAL_CONSUMPTION_ORIGIN, ADVERSARIAL_INSTRUCTIONS_KEY, ADVERSARIAL_LEVEL_DEFS, ADVERSARIAL_STAGE_LABEL, type AdversarialDecision } from "../constants"
import { buildContextSections, renderContext, type PlanVersion, type PreviousRound } from "../context"
import { ADVERSARIAL_SESSION_PERMISSIONS, decidePermission } from "../permission-policy"
import { buildAdversarialInstructions, buildFixPrompt, buildReviewPrompt } from "../prompt"
import { decideRound, findingsToFix, planRound } from "../rounds"
import type { AdversarialSettings } from "../schemas"
import { evaluateFindings, parseDisputes, parseReviewOutput, sortFindings, type EvaluatedFinding } from "../verdict"
import { listTaskAttachments, loadPromptFiles } from "./attachments"
import { AdversarialReview, type IAdversarialReview } from "./models"
import { publishReviews, removeReviewSession, workbenchReviews } from "./reviews"
import { loadAdversarialSettings } from "./settings"

/**
 * Rodada do Agente Adversário (SOMENTE servidor). Chamada pelo fluxo da mesa ao fim da
 * implementação: abre uma sessão NOVA do OpenCode no worktree (contexto limpo, só leitura), revisa o
 * diff e devolve o que a mesa faz em seguida. A saída vai para o barramento da própria mesa.
 */

const log = loggerFor({ module: "adversarial-agent" })
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

export interface AdversaryRoundInput {
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    worktreePath: string
    branch: string
    baseBranch: string
    plans: readonly PlanVersion[]
    /** Instruções da central para a implementação. */
    centralInstructions: string
    /** Resposta final do turno anterior do implementador (traz as contestações de uma correção). */
    implementationText: string
    signal: AbortSignal
    onStep?: (usage: { costUsd: number; tokens: OpencodeTokenUsage }) => void | Promise<void>
    heartbeat?: () => void | Promise<void>
}

/** O que a mesa faz depois da rodada. */
export type AdversaryRoundOutcome =
    /** Aprovado ou seguir com aviso (limite de rodadas/falha com "seguir"): prévia ou PR. */
    | { kind: "proceed"; level: "success" | "warn"; message: string }
    /** Correção automática: turno de implementação com este texto. */
    | { kind: "fix"; text: string; message: string }
    /** Aguarda o usuário (Corrigir, Seguir mesmo assim, Revisar de novo). */
    | { kind: "blocked"; message: string }
    /** Falhou ou foi interrompido com "pausar": a mesa para (Tentar novamente / Seguir mesmo assim). */
    | { kind: "failed" | "interrupted"; message: string }

/** Sessões de rodadas anteriores que não puderam ser excluídas: tenta de novo (melhor esforço). */
async function retryPendingDeletions(client: OpencodeClient, history: readonly IAdversarialReview[]): Promise<void> {
    for (const doc of history) {
        if (!doc.pendingSessionDeletion) continue
        if (await removeReviewSession(client, doc.pendingSessionDeletion)) await AdversarialReview.updateOne({ _id: doc._id }, { $set: { pendingSessionDeletion: null } })
    }
}

function previousRound(history: readonly IAdversarialReview[], index: number | null, implementationText: string): { previous: PreviousRound | null; disputes: { id: string; reason: string }[] } {
    const doc = index === null ? null : history[index]
    if (!doc) return { previous: null, disputes: [] }
    const disputes = doc.decision === "fix-auto" || doc.decision === "fix-user" ? parseDisputes(implementationText) : []
    const findings = findingsToFix(doc.findings ?? [], doc.excluded ?? []).map((finding) => ({ id: finding.id, severity: finding.severity, title: finding.title, file: finding.file, line: finding.line, scenario: finding.scenario, suggestion: finding.suggestion }))
    return { previous: { round: doc.round, findings, disputes, userText: doc.userText ?? null }, disputes }
}

const needsTask = (settings: AdversarialSettings) => {
    const task = settings.context.task
    return Object.entries(task).some(([key, value]) => (key === "attachments" ? value !== "none" : value === true))
}

async function loadTaskSafe(taskId: string, publish: (event: WorkbenchEventPayload) => void): Promise<TaskDetailDto | null> {
    try {
        return await getTask(taskId)
    } catch (error) {
        publish({ type: "notice", level: "warn", message: `Agente adversário: não foi possível ler a tarefa (${errorText(error)}); a revisão segue só com o código.` })
        return null
    }
}

/** Rótulos das tags da tarefa (taxonomia da feature "Tags de tarefas"); sem taxonomia, os próprios ids. */
async function tagLabelsOf(ids: readonly string[]): Promise<string[]> {
    if (!ids.length) return []
    try {
        const { settings } = await loadTaskTagsSettings()
        return ids.map((id) => tagLabel(id, settings.taxonomy))
    } catch {
        return [...ids]
    }
}

async function applyInstructions(client: OpencodeClient, sessionId: string, instructions: string): Promise<boolean> {
    try {
        await client.session.instructions.entry.put({ sessionID: sessionId, key: ADVERSARIAL_INSTRUCTIONS_KEY, value: instructions })
        return true
    } catch {
        return false
    }
}

function verdictEvent(doc: { id: string; round: number; level: AdversarialSettings["level"]; summary: string; findings: readonly EvaluatedFinding[]; outcome: string }): WorkbenchEventPayload {
    return {
        type: "adversarial-verdict",
        reviewId: doc.id,
        round: doc.round,
        level: ADVERSARIAL_LEVEL_DEFS[doc.level].label,
        summary: doc.summary,
        outcome: doc.outcome,
        findings: sortFindings(doc.findings).map((finding) => ({ id: finding.id, severity: finding.severity, title: finding.title, file: finding.file, line: finding.line, blocking: finding.blocking, demotedReason: finding.demotedReason })),
    }
}

/** Executa uma rodada de revisão. Nunca lança: erros viram `failed` (ou seguem, conforme a configuração). */
export async function runAdversaryRound(input: AdversaryRoundInput): Promise<AdversaryRoundOutcome> {
    const publish = (event: WorkbenchEventPayload) => publishWorkbenchEvent(input.workbenchId, event)
    const { settings } = await loadAdversarialSettings()
    const history = await workbenchReviews(input.workbenchId)
    const plan = planRound(history)
    const { previous, disputes } = previousRound(history, plan.previousIndex, input.implementationText)
    const created = await AdversarialReview.create({
        workbenchId: input.workbenchId,
        centralId: input.centralId,
        taskId: input.taskId,
        taskCode: input.taskCode,
        taskTitle: input.taskTitle,
        cycle: plan.cycle,
        round: plan.round,
        level: settings.level,
        state: "running",
        disputes,
        startedAt: new Date(),
    })
    const reviewId = String(created._id)
    const filter = { _id: created._id }
    await publishReviews(input.workbenchId)
    const finish = async (set: Partial<IAdversarialReview>, decision: AdversarialDecision) => {
        await AdversarialReview.updateOne(filter, { $set: { ...set, decision, finishedAt: new Date() } })
        await recordAudit({
            userId: getLocalUser().id,
            entidade: ADVERSARIAL_AUDIT_ENTITY,
            entidadeId: reviewId,
            acao: AcaoAuditoria.CRIAR,
            depois: { tarefa: input.taskCode, ciclo: plan.cycle, rodada: plan.round, nivel: settings.level, estado: set.state, decisao: decision },
        })
        await publishReviews(input.workbenchId)
    }
    const failure = async (state: "failed" | "interrupted", message: string): Promise<AdversaryRoundOutcome> => {
        if (state === "interrupted") {
            await finish({ state, error: message }, "interrupted")
            return { kind: "interrupted", message }
        }
        if (settings.onFailure === "continue") {
            await finish({ state, error: message }, "proceeded-failure")
            return { kind: "proceed", level: "warn", message: `Agente adversário falhou (${message}): seguindo sem a revisão, conforme a configuração.` }
        }
        await finish({ state, error: message }, "failed")
        return { kind: "failed", message: `Agente adversário falhou: ${message}` }
    }

    let client: OpencodeClient | null = null
    let sessionId: string | null = null
    try {
        client = await getOpencodeClient()
        await retryPendingDeletions(client, history)
        const task = needsTask(settings) ? await loadTaskSafe(input.taskId, publish) : null
        const attachments = task && settings.context.task.attachments !== "none" ? await listTaskAttachments(input.taskId) : []
        const files = settings.context.task.attachments === "files" ? await loadPromptFiles(attachments, input.signal) : []
        const tagLabels = task && settings.context.task.insights ? await tagLabelsOf(task.tags) : undefined
        const context = renderContext(
            buildContextSections(settings.context, { task, plans: input.plans, centralInstructions: input.centralInstructions, previous, attachments, tagLabels, attachedFiles: files.map((file) => file.name) }),
        )
        const instructions = buildAdversarialInstructions({ level: settings.level, instructions: settings.instructions, memories: await agentMemoryTexts(["adversarial"]) })
        const session = await client.session.create({
            title: `Adversário · ${input.taskCode} · rodada ${plan.round}`.slice(0, 120),
            location: { directory: input.worktreePath },
            metadata: { app: "opex", kind: "adversarial-review", workbenchId: input.workbenchId, reviewId },
            permissions: [...ADVERSARIAL_SESSION_PERMISSIONS],
        })
        sessionId = session.id
        await AdversarialReview.updateOne(filter, { $set: { sessionId } })
        const applied = await applyInstructions(client, sessionId, instructions)
        const prompt = buildReviewPrompt({ code: input.taskCode, title: input.taskTitle, worktreePath: input.worktreePath, branch: input.branch, baseBranch: input.baseBranch, round: plan.round, context })
        const text = applied ? prompt : `${instructions}\n\n---\n${prompt}`
        const opencode = client
        const sid = sessionId
        const result: TurnResult = await runWithFallback(
            settings.agent,
            text,
            (agent, body) =>
                runAgentTurn(
                    opencode,
                    {
                        id: input.workbenchId,
                        sessionId: sid,
                        stage: "adversarial_review",
                        title: `${ADVERSARIAL_STAGE_LABEL} · rodada ${plan.round}`,
                        agent,
                        text: body,
                        timeoutMs: settings.timeoutMinutes * 60_000,
                        signal: input.signal,
                        consumption: { origin: ADVERSARIAL_CONSUMPTION_ORIGIN, subject: input.workbenchId },
                        files,
                    },
                    {
                        publish,
                        // Ninguém responde durante a revisão: a política de leitura decide na hora.
                        onPermission: async (permission) => {
                            const decision = decidePermission(permission)
                            await opencode.permission.reply({ sessionID: sid, requestID: permission.id, decision, ...(decision === "reject" ? { message: "O agente adversário só lê o código: não altera arquivos nem roda testes, build, lint ou typecheck." } : {}) }).catch(() => undefined)
                            publish({ type: "permission-replied", id: permission.id, decision })
                        },
                        onForm: async (form) => {
                            await opencode.session.form.cancel({ sessionID: sid, formID: form.id }).catch(() => undefined)
                            publish({ type: "form-closed", id: form.id })
                        },
                        onStep: async ({ costUsd, tokens }) => {
                            await AdversarialReview.updateOne(filter, { $inc: { "usage.costUsd": costUsd, "usage.inputTokens": tokens.input, "usage.outputTokens": tokens.output, "usage.reasoningTokens": tokens.reasoning } })
                            await input.onStep?.({ costUsd, tokens })
                        },
                        heartbeat: input.heartbeat,
                    },
                ),
            {
                signal: input.signal,
                onSwitch: (change) => {
                    publish({ type: "notice", level: "warn", message: `Agente adversário: ${fallbackNotice(change)}` })
                },
            },
        )
        await flushWorkbenchEvents(input.workbenchId)
        if (result.outcome === "interrupted") return await failure("interrupted", result.message ?? "Revisão interrompida")
        if (result.outcome === "failed") return await failure("failed", result.message ?? "o agente não concluiu a revisão")
        const parsed = parseReviewOutput(result.text)
        if (!parsed) return await failure("failed", "a resposta não trouxe o bloco JSON com os achados")

        const findings = evaluateFindings(parsed.findings, settings.level, plan.round)
        const outcome = decideRound(findings, plan.round, settings)
        const blocking = findings.filter((finding) => finding.blocking)
        const labels: Record<typeof outcome.kind, string> = {
            approved: "Aprovado",
            fix: "Bloqueou: corrigindo automaticamente",
            blocked: outcome.kind === "blocked" && outcome.limitReached ? "Bloqueou no limite de rodadas: aguardando você" : "Bloqueou: aguardando você",
            proceed: "Bloqueou no limite de rodadas: seguindo com aviso",
        }
        publish(verdictEvent({ id: reviewId, round: plan.round, level: settings.level, summary: parsed.summary, findings, outcome: labels[outcome.kind] }))
        await finish({ state: "done", summary: parsed.summary || null, findings, previous: parsed.previous, report: result.text, limitReached: outcome.kind === "blocked" && outcome.limitReached }, outcome.decision)
        log.info({ workbenchId: input.workbenchId, reviewId, round: plan.round, blocking: blocking.length, decision: outcome.decision }, `[adversarial] ${input.taskCode} rodada ${plan.round}: ${outcome.decision}`)

        switch (outcome.kind) {
            case "approved":
                return { kind: "proceed", level: "success", message: `Agente adversário aprovou a implementação (rodada ${plan.round}).` }
            case "proceed":
                return { kind: "proceed", level: "warn", message: `Agente adversário ainda bloqueia ${blocking.length} achado(s), mas o limite de ${settings.rounds.max} rodada(s) foi atingido: seguindo, conforme a configuração.` }
            case "fix":
                return { kind: "fix", text: buildFixPrompt({ round: plan.round, worktreePath: input.worktreePath, findings: blocking }), message: `Agente adversário bloqueou ${blocking.length} achado(s): o implementador vai corrigir (rodada ${plan.round}).` }
        }
        return {
            kind: "blocked",
            message: outcome.limitReached
                ? `Agente adversário ainda bloqueia ${blocking.length} achado(s) e o limite de ${settings.rounds.max} rodada(s) foi atingido: decida como seguir.`
                : `Agente adversário bloqueou ${blocking.length} achado(s): escolha Corrigir, Seguir mesmo assim ou Revisar de novo.`,
        }
    } catch (error) {
        log.error({ err: errorText(error), workbenchId: input.workbenchId, reviewId }, "[adversarial] falha na rodada")
        return failure(input.signal.aborted ? "interrupted" : "failed", errorText(error))
    } finally {
        if (client && sessionId) {
            const removed = await removeReviewSession(client, sessionId)
            await AdversarialReview.updateOne(filter, { $set: { sessionId: null, pendingSessionDeletion: removed ? null : sessionId } }).catch(() => undefined)
        }
    }
}
