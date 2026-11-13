import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { getLocalUser } from "@/lib/local-user"
import { publishAppEvent } from "@/lib/pusher/channels"
import type { WorkbenchNoticeMemoryRef } from "@/features/agentic/types"
import { noticeMemoryRef } from "@/features/ai/memory-notice"
import {
    MENTOR_AUDIT_ENTITY,
    MENTOR_DECISION_CONSUMPTION_ORIGIN,
    MENTOR_DIGEST_CONSUMPTION_ORIGIN,
    MENTOR_ROUTER_CONSUMPTION_ORIGIN,
    MENTOR_UPDATED_EVENT,
    MENTOR_WRITER_ATTEMPTS,
    MENTOR_WRITER_CONSUMPTION_ORIGIN,
    type MentorCaseStatus,
    type MentorOperation,
    type MentorRunStatus,
    type MentorTarget,
} from "../../mentor/constants"
import { parseDeciderAnswer, parseRouterAnswer, passesThreshold, routerChoiceOf } from "../../mentor/decision"
import { buildCaseState, buildDigestPrompt, MENTOR_DIGEST_INSTRUCTIONS, parseDigestAnswer, type MentorDigestCase } from "../../mentor/digest"
import { parseWriterOps, resolveWriterOps, type ResolvedOperation, type WriterMemory } from "../../mentor/operations"
import {
    buildDeciderPrompt,
    buildJevMentorQuestions,
    buildJevRouterQuestions,
    buildRouterInstructions,
    buildRouterPrompt,
    buildRouterState,
    buildWriterInstructions,
    buildWriterPrompt,
    MENTOR_DECIDER_INSTRUCTIONS,
    type TargetSummaries,
} from "../../mentor/prompt"
import { sanitizeMemoryText, type SanitizeContext } from "../../mentor/sanitize"
import type { MentorSettings } from "../../mentor/schemas"
import { applyOperation, type ApplyContext } from "./apply"
import { MentorRun, MentorRunCase, mentorDb, type IMentorCaseOperation, type IMentorRun, type IMentorRunCase } from "./models"
import { centralOf, generate, listWriterMemories, log, targetTextMax, type StepUsage } from "./steps"
import { loadWorkbenchTranscript, type LoadedTranscript } from "./transcript"

/**
 * Aprendizado na conclusão da mesa (OPE-165): transcrição inteira (compactada acima do limiar) →
 * digestor (casos) → para cada caso, decisor (rigor) → Triador (UMA lista) → redator (operações nessa
 * lista) → sanitizador → aplicação automática. O orçamento é conferido depois de cada chamada; passar
 * dele aborta e registra o motivo. Roda em segundo plano: nunca muda a mesa.
 */

export interface MentorLearningInput {
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    projectName: string | null
    repo: string | null
    completedAt: Date
    completionKind: "merge" | "manual"
}

export class MentorBudgetExceeded extends Error {
    constructor(budget: number, spent: number) {
        super(`Orçamento de US$ ${budget.toFixed(2)} excedido (gasto US$ ${spent.toFixed(4)}): a execução foi interrompida.`)
        this.name = "MentorBudgetExceeded"
    }
}

const publish = (runId: string) => publishAppEvent(MENTOR_UPDATED_EVENT, { runId }).catch(() => undefined)

async function setRun(runId: string, set: Partial<IMentorRun>, notify = true): Promise<void> {
    await MentorRun.updateOne({ _id: runId }, { $set: set })
    if (notify) await publish(runId)
}

const setCase = (caseId: IMentorRunCase["_id"], set: Partial<IMentorRunCase>) => MentorRunCase.updateOne({ _id: caseId }, { $set: set })

/** Orçamento: lança `MentorBudgetExceeded` quando o custo acumulado passa do configurado. */
export function assertBudget(usage: StepUsage, budgetUsd: number): void {
    if (usage.costUsd > budgetUsd) throw new MentorBudgetExceeded(budgetUsd, usage.costUsd)
}

/** Nota do decisor (0 a 1) e o motivo. */
async function decide(settings: MentorSettings, state: Record<string, unknown>, subject: string, usage: StepUsage): Promise<{ score: number; reason: string | null }> {
    const { provider, model, variant } = settings.decider
    if (!provider || !model) throw new Error("O decisor do Agente Mentor não tem provedor e modelo configurados")
    if (provider === "jev") {
        const { askJevSystemOne } = await import("@/lib/ai/jev")
        const response = await askJevSystemOne({ model, state, questions: buildJevMentorQuestions(), signal: AbortSignal.timeout(settings.timeoutSeconds * 1000), tracking: { feature: MENTOR_DECISION_CONSUMPTION_ORIGIN, subject } })
        const answer = response.answers?.lesson
        if (!answer || answer.type !== "noul") throw new Error("O JEV não respondeu a pergunta do Agente Mentor")
        return { score: answer.noul, reason: null }
    }
    const text = await generate({ provider, model, variant, instructions: MENTOR_DECIDER_INSTRUCTIONS, prompt: buildDeciderPrompt(state), timeoutSeconds: settings.timeoutSeconds, origin: MENTOR_DECISION_CONSUMPTION_ORIGIN, subject }, usage)
    const parsed = parseDeciderAnswer(text)
    if (!parsed) throw new Error("O decisor do Agente Mentor respondeu sem o JSON esperado")
    return { score: parsed.score, reason: parsed.reason || null }
}

/** Lista de destino escolhida pelo Triador (sem chamada quando só uma vale). */
async function route(settings: MentorSettings, state: Record<string, unknown>, lists: readonly TargetSummaries[], subject: string, usage: StepUsage): Promise<{ target: MentorTarget; confidence: number | null; reason: string | null }> {
    const targets = lists.map((list) => list.target)
    if (targets.length === 1) return { target: targets[0]!, confidence: null, reason: null }
    const { provider, model, variant, instructions } = settings.router
    if (!provider || !model) throw new Error("O Triador do Agente Mentor não tem provedor e modelo configurados")
    const routerState = buildRouterState(state, lists)
    if (provider === "jev") {
        const { askJevSystemOne } = await import("@/lib/ai/jev")
        const response = await askJevSystemOne({ model, state: routerState, questions: buildJevRouterQuestions(targets, instructions), signal: AbortSignal.timeout(settings.timeoutSeconds * 1000), tracking: { feature: MENTOR_ROUTER_CONSUMPTION_ORIGIN, subject } })
        const answer = response.answers?.target
        if (!answer || answer.type !== "choice") throw new Error("O JEV não respondeu a pergunta do Triador do Agente Mentor")
        const target = routerChoiceOf(answer.choice, targets)
        if (!target) throw new Error(`O Triador do Agente Mentor escolheu um destino desligado ("${answer.choice}")`)
        return { target, confidence: answer.confidence, reason: null }
    }
    const text = await generate({ provider, model, variant, instructions: buildRouterInstructions(targets, instructions), prompt: buildRouterPrompt(routerState), timeoutSeconds: settings.timeoutSeconds, origin: MENTOR_ROUTER_CONSUMPTION_ORIGIN, subject }, usage)
    const parsed = parseRouterAnswer(text, targets)
    if (!parsed) throw new Error("O Triador do Agente Mentor respondeu sem um destino válido")
    return { target: parsed.target, confidence: parsed.confidence, reason: parsed.reason || null }
}

/** Listas de destino lidas do Engramind uma vez e relidas depois de cada caso que as alterou. */
class TargetLists {
    private cache = new Map<MentorTarget, WriterMemory[]>()
    constructor(
        private readonly targets: readonly MentorTarget[],
        private readonly centralId: string,
    ) {}
    async get(target: MentorTarget): Promise<WriterMemory[]> {
        const cached = this.cache.get(target)
        if (cached) return cached
        const memories = await listWriterMemories(target, this.centralId)
        this.cache.set(target, memories)
        return memories
    }
    invalidate(target: MentorTarget): void {
        this.cache.delete(target)
    }
    async summaries(): Promise<TargetSummaries[]> {
        return Promise.all(this.targets.map(async (target) => ({ target, summaries: (await this.get(target)).map((memory) => memory.summary) })))
    }
}

interface CaseContext {
    runId: string
    input: MentorLearningInput
    settings: MentorSettings
    targets: readonly MentorTarget[]
    lists: TargetLists
    usage: StepUsage
    transcript: LoadedTranscript
    apply: ApplyContext
}

async function sanitizeContextOf(ctx: CaseContext, item: MentorDigestCase, target: MentorTarget): Promise<SanitizeContext> {
    return {
        textMax: await targetTextMax(target, centralOf(target, ctx.input.centralId)),
        allowPaths: target === "developer-central",
        taskCode: ctx.input.taskCode,
        taskTitle: ctx.input.taskTitle,
        projectName: ctx.input.projectName,
        repo: ctx.input.repo,
        // A memória da central pode repetir um comando citado na evidência; as demais, não.
        sources: [...ctx.transcript.ownerMessages, ...(target === "developer-central" ? [] : item.evidence)],
    }
}

/** Situação do caso pelo resultado das operações. */
const caseStatusOf = (operations: readonly IMentorCaseOperation[]): MentorCaseStatus => {
    const applied = operations.filter((operation) => operation.status === "applied").length
    if (applied === operations.length) return "applied"
    return applied ? "partial" : "failed"
}

/** Um caso pelo funil. Erros de etapa viram `failed` no caso; o orçamento sobe para abortar a execução. */
async function processCase(ctx: CaseContext, doc: IMentorRunCase, item: MentorDigestCase): Promise<{ status: MentorCaseStatus; operations: IMentorCaseOperation[] }> {
    const { settings, usage } = ctx
    const budget = settings.digest.budgetUsd
    const subject = ctx.input.taskCode
    try {
        const state = buildCaseState(item, { code: ctx.input.taskCode, title: ctx.input.taskTitle })
        const decision = await decide(settings, state, subject, usage)
        assertBudget(usage, budget)
        await setCase(doc._id, { score: decision.score, deciderReason: decision.reason })
        if (!passesThreshold(decision.score, settings.level)) {
            await setCase(doc._id, { status: "skipped" })
            return { status: "skipped", operations: [] }
        }
        const routed = await route(settings, state, await ctx.lists.summaries(), subject, usage)
        assertBudget(usage, budget)
        const target = routed.target
        await setCase(doc._id, { target, centralId: centralOf(target, ctx.input.centralId), routerConfidence: routed.confidence, routerReason: routed.reason })
        const { provider, model, variant, instructions } = settings.writer
        if (!provider || !model) throw new Error("O redator do Agente Mentor não tem provedor e modelo configurados")
        const memories = await ctx.lists.get(target)
        const others = (await ctx.lists.summaries()).filter((list) => list.target !== target)
        const otherIds = (await Promise.all(others.map((list) => ctx.lists.get(list.target)))).flat().map((memory) => memory.id)
        const sanitize = await sanitizeContextOf(ctx, item, target)
        let rejection: string | null = null
        for (let attempt = 0; attempt < MENTOR_WRITER_ATTEMPTS; attempt++) {
            const text = await generate(
                { provider, model, variant, instructions: buildWriterInstructions(instructions, target), prompt: buildWriterPrompt(state, memories, rejection, target, others), timeoutSeconds: settings.timeoutSeconds, origin: MENTOR_WRITER_CONSUMPTION_ORIGIN, subject },
                usage,
            )
            assertBudget(usage, budget)
            const answer = parseWriterOps(text)
            if (!answer) {
                rejection = 'A resposta não tinha o JSON esperado ({"operations": [...]} ou {"operations": [], "skip": {...}}).'
                continue
            }
            const resolved = resolveWriterOps(answer, memories, otherIds)
            if (resolved.kind === "rejected") {
                rejection = resolved.rejection
                continue
            }
            if (resolved.kind === "skip") {
                await setCase(doc._id, { status: "skipped", skipKind: resolved.skipKind, coveredBy: resolved.memoryId, writerReason: resolved.reason || null, rejection })
                return { status: "skipped", operations: [] }
            }
            const blocked = resolved.operations.map((operation) => (operation.text ? sanitizeMemoryText(operation.text, sanitize) : null)).find(Boolean) ?? null
            if (blocked) {
                rejection = blocked
                continue
            }
            const applied: IMentorCaseOperation[] = []
            for (const operation of resolved.operations) applied.push(await applyOperation(ctx.apply, target, operation as ResolvedOperation))
            ctx.lists.invalidate(target)
            const reasons = resolved.operations.map((operation) => operation.reason).filter(Boolean)
            const status = caseStatusOf(applied)
            await setCase(doc._id, { status, operations: applied, writerReason: reasons.join(" · ") || null, rejection: null })
            return { status, operations: applied }
        }
        await setCase(doc._id, { status: "discarded", rejection })
        return { status: "discarded", operations: [] }
    } catch (error) {
        if (error instanceof MentorBudgetExceeded) throw error
        const message = error instanceof Error ? error.message : String(error)
        log.warn({ err: error, runId: ctx.runId, case: doc.index }, "[adversarial-agent] Agente Mentor: caso falhou")
        await setCase(doc._id, { status: "failed", error: message })
        return { status: "failed", operations: [] }
    }
}

/** Contagem das operações aplicadas (e das falhas). */
export function countOperations(operations: readonly IMentorCaseOperation[]): Partial<Record<MentorOperation | "failed", number>> {
    const counts: Partial<Record<MentorOperation | "failed", number>> = {}
    for (const operation of operations) {
        const key = operation.status === "applied" ? operation.op : "failed"
        counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
}

/** Operações aplicadas por lista de destino. */
export function countTargets(operations: readonly IMentorCaseOperation[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const operation of operations) if (operation.status === "applied") counts[operation.target] = (counts[operation.target] ?? 0) + 1
    return counts
}

/** Aviso discreto na Saída da IA da mesa, com a referência das memórias criadas, atualizadas ou fundidas. */
async function noticeOnWorkbench(workbenchId: string, operations: readonly IMentorCaseOperation[], centralId: string): Promise<void> {
    const applied = operations.filter((operation) => operation.status === "applied" && operation.memoryId)
    if (!applied.length) return
    const refs: WorkbenchNoticeMemoryRef[] = applied
        .filter((operation) => operation.op !== "archive")
        .map((operation) => noticeMemoryRef(operation.target, { id: operation.memoryId! }, operation.op === "create" ? "created" : "updated", { centralId: centralOf(operation.target, centralId) ?? undefined }))
    const archived = applied.filter((operation) => operation.op === "archive").length + applied.reduce((sum, operation) => sum + (operation.op === "merge" ? operation.absorbed.length : 0), 0)
    const parts = [`${refs.length} ${refs.length === 1 ? "memória gravada" : "memórias gravadas"}`, ...(archived ? [`${archived} ${archived === 1 ? "arquivada" : "arquivadas"}`] : [])]
    try {
        const { flushWorkbenchEvents, prepareHub, publishWorkbenchEvent } = await import("@/features/agentic/server/hub")
        await prepareHub(workbenchId)
        publishWorkbenchEvent(workbenchId, { type: "notice", level: "info", message: `O Agente Mentor aprendeu com esta mesa: ${parts.join(", ")}. Detalhes na aba Aprendizado.`, ...(refs.length ? { memories: refs } : {}) })
        await flushWorkbenchEvents(workbenchId)
    } catch {
        // O aviso é cortesia: a execução já está registrada.
    }
}

/** Executa uma execução de aprendizado já registrada (`queued`). Nunca lança: falha vira `failed`. */
export async function processMentorLearning(runId: string, input: MentorLearningInput, settings: MentorSettings, targets: readonly MentorTarget[]): Promise<MentorRunStatus> {
    const startedAt = Date.now()
    const usage: StepUsage = { costUsd: 0 }
    const operations: IMentorCaseOperation[] = []
    const finish = async (status: MentorRunStatus, set: Partial<IMentorRun> = {}) => {
        await setRun(runId, { status, ...set, costUsd: usage.costUsd, operationCounts: countOperations(operations), targetCounts: countTargets(operations), durationMs: Date.now() - startedAt, finishedAt: new Date(), heartbeatAt: new Date() })
        await recordAudit({
            userId: getLocalUser().id,
            entidade: MENTOR_AUDIT_ENTITY,
            entidadeId: runId,
            acao: AcaoAuditoria.EXECUTAR,
            depois: { status, tarefa: input.taskCode, mesa: input.workbenchId, origens: ["done"], operacoes: countOperations(operations), ...(set.error ? { erro: set.error } : {}) },
        })
        return status
    }
    try {
        await mentorDb()
        await setRun(runId, { status: "running", startedAt: new Date(), heartbeatAt: new Date() })
        const transcript = await loadWorkbenchTranscript({ workbenchId: input.workbenchId, taskCode: input.taskCode, taskTitle: input.taskTitle, projectName: input.projectName, completedAt: input.completedAt }, settings.digest.compactThresholdChars)
        await setRun(runId, {
            transcript: { originalChars: transcript.originalChars, sentChars: transcript.sentChars, compacted: transcript.compacted, level: transcript.level, aboveThreshold: transcript.aboveThreshold, eventCount: transcript.eventCount, forkCount: transcript.forkCount },
        })
        if (!transcript.hasConversation) throw new Error("Transcrição vazia: a mesa não tem mensagens do dono nem texto do agente gravados")

        const { provider, model, variant } = settings.digest
        if (!provider || !model) throw new Error("O digestor do Agente Mentor não tem provedor e modelo configurados")
        await setRun(runId, { digestModel: `${provider}/${model}` })
        const answer = await generate(
            { provider, model, variant, instructions: MENTOR_DIGEST_INSTRUCTIONS, prompt: buildDigestPrompt(transcript.text), timeoutSeconds: settings.digest.timeoutSeconds, origin: MENTOR_DIGEST_CONSUMPTION_ORIGIN, subject: input.taskCode },
            usage,
        )
        assertBudget(usage, settings.digest.budgetUsd)
        const cases = parseDigestAnswer(answer)
        if (!cases) throw new Error("O digestor do Agente Mentor respondeu sem o JSON esperado")
        await setRun(runId, { caseCount: cases.length, costUsd: usage.costUsd, lessonCount: cases.length })
        if (!cases.length) return await finish("skipped", { deciderReason: "O digestor não encontrou lições nesta mesa" })

        const docs = await MentorRunCase.insertMany(
            cases.map((item, index) => ({ runId, workbenchId: input.workbenchId, index, lesson: item.lesson, evidence: item.evidence, nature: item.nature, scope: item.scope, detection: item.detection ?? null, status: "pending", operations: [] })),
        )
        const ctx: CaseContext = {
            runId,
            input,
            settings,
            targets,
            lists: new TargetLists(targets, input.centralId),
            usage,
            transcript,
            apply: { runId, workbenchId: input.workbenchId, taskCode: input.taskCode, centralId: input.centralId, actorId: getLocalUser().id },
        }
        let failedCases = 0
        for (const [index, doc] of docs.entries()) {
            const result = await processCase(ctx, doc as unknown as IMentorRunCase, cases[index]!)
            operations.push(...result.operations)
            if (result.status === "failed") failedCases++
            await setRun(runId, { costUsd: usage.costUsd, operationCounts: countOperations(operations) })
        }
        await noticeOnWorkbench(input.workbenchId, operations, input.centralId)
        if (operations.some((operation) => operation.status === "applied")) return await finish("learned")
        if (failedCases) return await finish("failed", { error: `${failedCases} ${failedCases === 1 ? "caso falhou" : "casos falharam"} e nenhuma memória foi gravada: veja os casos` })
        return await finish("skipped")
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn({ err: error, runId, workbenchId: input.workbenchId }, "[adversarial-agent] Agente Mentor: aprendizado falhou")
        await noticeOnWorkbench(input.workbenchId, operations, input.centralId)
        return finish("failed", { error: message, ...(error instanceof MentorBudgetExceeded ? { abortReason: "budget" as const } : {}) }).catch(() => "failed" as const)
    }
}
