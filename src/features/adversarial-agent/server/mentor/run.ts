import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import type { AiProviderId } from "@/lib/ai/providers"
import { flushWorkbenchEvents, prepareHub, publishWorkbenchEvent } from "@/features/agentic/server/hub"
import { MENTOR_AUDIT_ENTITY, MENTOR_DECISION_CONSUMPTION_ORIGIN, MENTOR_MEMORY_SOURCE, MENTOR_PAGE_LIMIT, MENTOR_UPDATED_EVENT, MENTOR_WRITER_CONSUMPTION_ORIGIN, type MentorRunStatus } from "../../mentor/constants"
import { parseDeciderAnswer, parseWriterAnswer, passesThreshold, resolveWriterAction } from "../../mentor/decision"
import { buildDeciderPrompt, buildJevMentorQuestions, buildMentorState, buildWriterInstructions, buildWriterPrompt, MENTOR_DECIDER_INSTRUCTIONS, type MentorCase } from "../../mentor/prompt"
import { sanitizeMemoryText, type SanitizeContext } from "../../mentor/sanitize"
import type { MentorRunListQuery, MentorSettings } from "../../mentor/schemas"
import type { MentorRunDto, MentorRunListDto } from "../../mentor/types"
import { AdversarialReview } from "../models"
import { createAgentMemory, listAgentMemories, updateAgentMemory, type AgentMemoryWriteOptions } from "@/features/ai/server/agent-memory-service"
import { pageInfo } from "@/lib/list/query"
import { listCentralOptions } from "../central-options"
import { buildMentorRunListFilter } from "./list-query"
import { MentorRun, mentorDb, type IMentorRun } from "./models"

/**
 * Pipeline de uma execução do Agente Mentor: contexto → decisor (JEV ou texto, nota contra o limiar
 * do slider) → redator (regra genérica + deduplicação/fusão) → sanitizador (recusa o que identifica o
 * caso; uma nova tentativa do redator) → grava a memória do adversário (ou deixa como sugestão).
 * Roda em segundo plano: nunca afeta a mesa.
 */

const log = loggerFor({ module: "adversarial-agent", feature: "mentor" })

/** Lista `adversarial` das memórias dos agentes (`agent_memories`), no formato que o redator lê. */
async function listAdversarialMemories(): Promise<{ id: string; summary: string; text: string }[]> {
    return (await listAgentMemories("adversarial")).map((memory) => ({ id: memory.id, summary: memory.resumo, text: memory.texto }))
}

async function createAdversarialMemory(text: string, actorId: string, options: AgentMemoryWriteOptions): Promise<{ memory: { id: string } }> {
    return { memory: { id: (await createAgentMemory("adversarial", text, actorId, options)).memoria.id } }
}

async function updateAdversarialMemory(id: string, text: string, actorId: string, options: AgentMemoryWriteOptions): Promise<{ memory: { id: string } }> {
    return { memory: { id: (await updateAgentMemory("adversarial", id, text, actorId, options)).memoria.id } }
}

export interface MentorRunInput {
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    projectName: string | null
    repo: string | null
    approvedPlan: string | null
    case: Omit<MentorCase, "task" | "adversarialVerdict" | "approvedPlan">
}

interface StepUsage {
    costUsd: number
}

export function toMentorRunDto(run: IMentorRun): MentorRunDto {
    return {
        id: String(run._id),
        workbenchId: run.workbenchId,
        taskId: run.taskId,
        taskCode: run.taskCode,
        taskTitle: run.taskTitle,
        sources: run.sources,
        trigger: run.trigger,
        userMessage: run.userMessage,
        lessonCount: run.lessonCount,
        status: run.status,
        level: run.level,
        score: run.score,
        threshold: run.threshold,
        deciderReason: run.deciderReason,
        writerAction: run.writerAction,
        writerReason: run.writerReason,
        sanitizerReason: run.sanitizerReason,
        proposal: run.proposal,
        memoryId: run.memoryId,
        error: run.error,
        costUsd: run.costUsd ?? 0,
        durationMs: run.durationMs,
        createdAt: new Date(run.createdAt).toISOString(),
        finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
    }
}

const publish = (runId: string) => publishAppEvent(MENTOR_UPDATED_EVENT, { runId }).catch(() => undefined)

async function setRun(runId: string, set: Partial<IMentorRun>): Promise<void> {
    await MentorRun.updateOne({ _id: runId }, { $set: set })
    await publish(runId)
}

/** Gera texto pelo provedor configurado e devolve o texto e o custo (lança na falha). */
async function generate(request: { provider: AiProviderId; model: string; variant: string | null; instructions: string; prompt: string; timeoutSeconds: number; origin: string; subject: string }, usage: StepUsage): Promise<string> {
    const { streamAi } = await import("@/lib/ai/stream")
    let text = ""
    for await (const event of streamAi({
        provider: request.provider,
        model: request.model,
        variant: request.variant,
        instructions: request.instructions,
        prompt: request.prompt,
        title: "Agente Mentor",
        signal: AbortSignal.timeout(request.timeoutSeconds * 1000),
        consumption: { origin: request.origin, subject: request.subject },
    })) {
        if (event.type === "delta") text += event.text
        if (event.type === "error") throw new Error(event.message)
        if (event.type === "done") usage.costUsd += event.usage.costUsd ?? 0
    }
    return text
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

async function verdictOf(workbenchId: string): Promise<MentorCase["adversarialVerdict"]> {
    const latest = await AdversarialReview.findOne({ workbenchId }).sort({ createdAt: -1 }).lean()
    if (!latest) return null
    return { summary: latest.summary, findings: (latest.findings ?? []).slice(0, 20).map((finding) => finding.title) }
}

function notice(workbenchId: string, level: "info" | "warn", message: string): Promise<void> {
    return (async () => {
        await prepareHub(workbenchId)
        publishWorkbenchEvent(workbenchId, { type: "notice", level, message })
        await flushWorkbenchEvents(workbenchId)
    })().catch(() => undefined)
}

/** Cria ou atualiza a memória do adversário com a origem do Mentor (auditoria com a mesa e a tarefa). */
async function applyProposal(run: Pick<IMentorRun, "_id" | "workbenchId" | "taskCode">, proposal: NonNullable<IMentorRun["proposal"]>, actorId: string) {
    const origin = { source: MENTOR_MEMORY_SOURCE, label: `Mentor · ${run.taskCode}` }
    const auditContext = { origem: "Agente Mentor", execucao: String(run._id), mesa: run.workbenchId, tarefa: run.taskCode }
    const result = proposal.action === "update" && proposal.memoryId ? await updateAdversarialMemory(proposal.memoryId, proposal.text, actorId, { origin, auditContext }) : await createAdversarialMemory(proposal.text, actorId, { origin, auditContext })
    return { status: (proposal.action === "update" && proposal.memoryId ? "updated" : "created") as MentorRunStatus, memoryId: result.memory.id }
}

/** Executa o pipeline de uma execução já registrada (`queued`). Nunca lança: falha vira `failed`. */
export async function processMentorRun(runId: string, input: MentorRunInput, settings: MentorSettings): Promise<MentorRunStatus> {
    const startedAt = Date.now()
    const usage: StepUsage = { costUsd: 0 }
    const finish = async (status: MentorRunStatus, set: Partial<IMentorRun> = {}) => {
        await setRun(runId, { status, ...set, costUsd: usage.costUsd, durationMs: Date.now() - startedAt, finishedAt: new Date() })
        await recordAudit({ userId: getLocalUser().id, entidade: MENTOR_AUDIT_ENTITY, entidadeId: runId, acao: AcaoAuditoria.EXECUTAR, depois: { status, tarefa: input.taskCode, mesa: input.workbenchId, origens: input.case.sources, memoria: set.memoryId ?? null } })
        return status
    }
    try {
        await mentorDb()
        await setRun(runId, { status: "running", startedAt: new Date() })
        const fullCase: MentorCase = {
            ...input.case,
            task: { code: input.taskCode, title: input.taskTitle },
            adversarialVerdict: settings.context.adversarialVerdict ? await verdictOf(input.workbenchId).catch(() => null) : null,
            approvedPlan: input.approvedPlan,
        }
        const state = buildMentorState(fullCase, settings.context)
        const subject = input.taskCode

        const developerOnly = input.case.sources.length === 1 && input.case.sources[0] === "developer"
        if (!(settings.triggers.developer.skipDecider && developerOnly && input.case.lessons.length)) {
            const decision = await decide(settings, state, subject, usage)
            await setRun(runId, { score: decision.score, deciderReason: decision.reason })
            if (!passesThreshold(decision.score, settings.level)) return await finish("skipped")
        }

        const { provider, model, variant, instructions } = settings.writer
        if (!provider || !model) throw new Error("O redator do Agente Mentor não tem provedor e modelo configurados")
        const memories = await listAdversarialMemories()
        const sanitizeContext: SanitizeContext = {
            taskCode: input.taskCode,
            taskTitle: input.taskTitle,
            projectName: input.projectName,
            repo: input.repo,
            sources: [input.case.userMessage, ...input.case.responses.map((response) => response.text), ...input.case.lessons.flatMap((lesson) => [lesson.problem, lesson.shouldHaveCaught, lesson.evidence, lesson.why])],
        }
        let rejection: string | null = null
        for (let attempt = 0; attempt < 2; attempt++) {
            const text = await generate(
                { provider, model, variant, instructions: buildWriterInstructions(instructions), prompt: buildWriterPrompt(state, memories, rejection), timeoutSeconds: settings.timeoutSeconds, origin: MENTOR_WRITER_CONSUMPTION_ORIGIN, subject },
                usage,
            )
            const answer = parseWriterAnswer(text)
            if (!answer) throw new Error("O redator do Agente Mentor respondeu sem o JSON esperado")
            if (answer.action === "skip") return await finish("skipped", { writerAction: "skip", writerReason: answer.reason || null })
            rejection = sanitizeMemoryText(answer.text, sanitizeContext)
            await setRun(runId, { writerAction: answer.action, writerReason: answer.reason || null, sanitizerReason: rejection })
            if (rejection) continue
            const proposal = resolveWriterAction(answer, memories.map((memory) => memory.id))
            if (settings.saveMode === "suggest") {
                await notice(input.workbenchId, "info", "O Agente Mentor sugeriu uma memória para o Agente Adversário: aprove ou descarte em Integrações › Inteligência Artificial › Agente Mentor.")
                return await finish("suggested", { proposal })
            }
            const applied = await applyProposal({ _id: new Types.ObjectId(runId), workbenchId: input.workbenchId, taskCode: input.taskCode }, proposal, getLocalUser().id)
            await notice(input.workbenchId, "info", applied.status === "updated" ? "O Agente Mentor atualizou uma memória do Agente Adversário com a lição deste turno." : "O Agente Mentor registrou uma memória nova do Agente Adversário com a lição deste turno.")
            return await finish(applied.status, { proposal, memoryId: applied.memoryId })
        }
        return await finish("discarded", { sanitizerReason: rejection })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn({ err: error, runId, workbenchId: input.workbenchId }, "[adversarial-agent] Agente Mentor falhou")
        return finish("failed", { error: message }).catch(() => "failed" as const)
    }
}

// ── Execuções na aba ────────────────────────────────────────────────────────

/** Execuções no recorte dos filtros, mais recentes primeiro, com as centrais (opções do filtro). */
export async function listMentorRuns(query: Partial<MentorRunListQuery> = {}): Promise<MentorRunListDto> {
    await mentorDb()
    const page = query.page ?? 1
    const limit = query.limit ?? MENTOR_PAGE_LIMIT
    const filter = buildMentorRunListFilter({ q: query.q ?? "", statuses: query.statuses ?? [], sources: query.sources ?? [], triggers: query.triggers ?? [], centrals: query.centrals ?? [], from: query.from, to: query.to })
    const [rows, total, centrals] = await Promise.all([
        MentorRun.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean() as unknown as Promise<IMentorRun[]>,
        MentorRun.countDocuments(filter),
        listCentralOptions(),
    ])
    return { items: rows.map(toMentorRunDto), ...pageInfo(page, limit, total), centrals }
}

async function suggestedRun(id: string): Promise<IMentorRun> {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Execução não encontrada", "MENTOR_RUN_NOT_FOUND")
    await mentorDb()
    const run = (await MentorRun.findById(id).lean()) as IMentorRun | null
    if (!run) throw new DomainError(404, "Execução não encontrada", "MENTOR_RUN_NOT_FOUND")
    if (run.status !== "suggested" || !run.proposal) throw new DomainError(409, "Esta execução não tem uma sugestão aguardando decisão", "MENTOR_RUN_NOT_SUGGESTED")
    return run
}

/**
 * Reivindica a sugestão antes de decidir (`suggested` → `running`, numa operação só): duas decisões
 * simultâneas (duplo clique, duas abas) não gravam a memória duas vezes — a segunda recebe 409.
 */
async function claimSuggestion(id: string): Promise<IMentorRun> {
    const run = await suggestedRun(id)
    const claimed = (await MentorRun.findOneAndUpdate({ _id: run._id, status: "suggested" }, { $set: { status: "running" } }).lean()) as IMentorRun | null
    if (!claimed) throw new DomainError(409, "Esta execução não tem uma sugestão aguardando decisão", "MENTOR_RUN_NOT_SUGGESTED")
    return run
}

/** Falha depois de reivindicar: a sugestão volta a aguardar decisão. */
const releaseSuggestion = (run: IMentorRun) => MentorRun.updateOne({ _id: run._id, status: "running" }, { $set: { status: "suggested" } }).catch(() => undefined)

/** Aprovar a sugestão (texto opcionalmente editado): grava a memória do adversário. */
export async function approveMentorRun(id: string, text: string | undefined, actorId: string): Promise<MentorRunDto> {
    const run = await claimSuggestion(id)
    const proposal = { ...run.proposal!, text: text?.trim() || run.proposal!.text }
    let applied: Awaited<ReturnType<typeof applyProposal>>
    try {
        const exists = proposal.action === "update" && proposal.memoryId ? (await listAdversarialMemories()).some((memory) => memory.id === proposal.memoryId) : false
        applied = await applyProposal(run, exists ? proposal : { ...proposal, action: "create", memoryId: null }, actorId)
    } catch (error) {
        await releaseSuggestion(run)
        throw error
    }
    await MentorRun.updateOne({ _id: run._id }, { $set: { status: applied.status, memoryId: applied.memoryId, proposal } })
    await recordAudit({ userId: actorId, entidade: MENTOR_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.APROVAR, depois: { status: applied.status, memoria: applied.memoryId, tarefa: run.taskCode } })
    await publish(id)
    return toMentorRunDto({ ...run, status: applied.status, memoryId: applied.memoryId, proposal })
}

/** Descartar a sugestão: nada é gravado. */
export async function discardMentorRun(id: string, actorId: string): Promise<MentorRunDto> {
    const run = await claimSuggestion(id)
    const reason = "Descartada pelo usuário"
    await MentorRun.updateOne({ _id: run._id }, { $set: { status: "discarded", sanitizerReason: reason } })
    await recordAudit({ userId: actorId, entidade: MENTOR_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.DEVOLVER, depois: { status: "discarded", tarefa: run.taskCode } })
    await publish(id)
    return toMentorRunDto({ ...run, status: "discarded", sanitizerReason: reason })
}
