import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import type { AiProviderId } from "@/lib/ai/providers"
import { flushWorkbenchEvents, prepareHub, publishWorkbenchEvent } from "@/features/agentic/server/hub"
import {
    MENTOR_AUDIT_ENTITY,
    MENTOR_DECISION_CONSUMPTION_ORIGIN,
    MENTOR_MEMORY_SOURCE,
    MENTOR_PAGE_LIMIT,
    MENTOR_ROUTER_CONSUMPTION_ORIGIN,
    MENTOR_TARGET_LABELS,
    MENTOR_UPDATED_EVENT,
    MENTOR_WRITER_CONSUMPTION_ORIGIN,
    type MentorRunStatus,
    type MentorTarget,
} from "../../mentor/constants"
import { parseDeciderAnswer, parseRouterAnswer, parseWriterAnswer, passesThreshold, resolveWriterAction, routerChoiceOf } from "../../mentor/decision"
import {
    buildDeciderPrompt,
    buildJevMentorQuestions,
    buildJevRouterQuestions,
    buildMentorState,
    buildRouterInstructions,
    buildRouterPrompt,
    buildRouterState,
    buildWriterInstructions,
    buildWriterPrompt,
    MENTOR_DECIDER_INSTRUCTIONS,
    type MentorCase,
    type TargetSummaries,
} from "../../mentor/prompt"
import { sanitizeMemoryText, type SanitizeContext } from "../../mentor/sanitize"
import { enabledTargets, type MentorRunListQuery, type MentorSettings } from "../../mentor/schemas"
import type { MentorProposal, MentorRunDto, MentorRunListDto } from "../../mentor/types"
import { AdversarialReview } from "../models"
import { createAgentMemory, listAgentMemories, updateAgentMemory, type AgentMemoryWriteOptions } from "@/features/ai/server/agent-memory-service"
import { pageInfo } from "@/lib/list/query"
import { listCentralOptions } from "../central-options"
import { buildMentorRunListFilter } from "./list-query"
import { MentorRun, mentorDb, type IMentorRun } from "./models"

/**
 * Pipeline de uma execução do Agente Mentor: contexto → decisor (JEV ou texto, nota contra o limiar
 * do slider) → Triador (OPE-97: escolhe UMA lista entre as ligadas — Agente Adversário, globais do
 * agente desenvolvedor ou as da central da mesa) → redator (regra para aquela lista + deduplicação/
 * fusão) → sanitizador (recusa o que identifica o caso; uma nova tentativa do redator) → grava a memória
 * (ou deixa como sugestão). Roda em segundo plano: nunca afeta a mesa.
 */

const log = loggerFor({ module: "adversarial-agent", feature: "mentor" })

/** Central da lista: só `developer-central` tem (a da mesa). */
const centralOf = (target: MentorTarget, centralId: string | null) => (target === "developer-central" ? centralId : null)

/** Memórias de uma lista (Engramind), no formato que o redator lê. */
async function listTargetMemories(target: MentorTarget, centralId: string | null): Promise<{ id: string; summary: string; text: string }[]> {
    return (await listAgentMemories(target, centralOf(target, centralId))).map((memory) => ({ id: memory.id, summary: memory.resumo, text: memory.texto }))
}

async function createTargetMemory(target: MentorTarget, text: string, actorId: string, options: AgentMemoryWriteOptions): Promise<{ memory: { id: string } }> {
    return { memory: { id: (await createAgentMemory(target, text, actorId, options)).memoria.id } }
}

async function updateTargetMemory(target: MentorTarget, id: string, text: string, actorId: string, options: AgentMemoryWriteOptions): Promise<{ memory: { id: string } }> {
    return { memory: { id: (await updateAgentMemory(target, id, text, actorId, options)).memoria.id } }
}

/** Proposta gravada (execuções de antes do Triador não têm destino: são do adversário). */
function proposalOf(run: Pick<IMentorRun, "proposal" | "centralId">): MentorProposal | null {
    if (!run.proposal) return null
    const target = run.proposal.target ?? "adversarial"
    return { action: run.proposal.action, memoryId: run.proposal.memoryId, text: run.proposal.text, target, centralId: centralOf(target, run.proposal.centralId ?? run.centralId) }
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
        centralId: run.centralId,
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
        target: run.target ?? run.proposal?.target ?? (run.proposal ? "adversarial" : null),
        routerConfidence: run.routerConfidence ?? null,
        routerReason: run.routerReason ?? null,
        routerProbabilities: run.routerProbabilities ?? null,
        writerAction: run.writerAction,
        writerReason: run.writerReason,
        sanitizerReason: run.sanitizerReason,
        proposal: proposalOf(run),
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

/** Lista de destino escolhida pelo Triador entre as ligadas (sem chamada quando só uma está ligada). */
async function route(
    settings: MentorSettings,
    state: Record<string, unknown>,
    lists: readonly TargetSummaries[],
    subject: string,
    usage: StepUsage,
): Promise<{ target: MentorTarget; confidence: number | null; reason: string | null; probabilities: Record<string, number> | null }> {
    const targets = lists.map((list) => list.target)
    if (targets.length === 1) return { target: targets[0]!, confidence: null, reason: null, probabilities: null }
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
        return { target, confidence: answer.confidence, reason: null, probabilities: answer.probabilities ?? null }
    }
    const text = await generate({ provider, model, variant, instructions: buildRouterInstructions(targets, instructions), prompt: buildRouterPrompt(routerState), timeoutSeconds: settings.timeoutSeconds, origin: MENTOR_ROUTER_CONSUMPTION_ORIGIN, subject }, usage)
    const parsed = parseRouterAnswer(text, targets)
    if (!parsed) throw new Error("O Triador do Agente Mentor respondeu sem um destino válido")
    return { target: parsed.target, confidence: parsed.confidence, reason: parsed.reason || null, probabilities: null }
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

/**
 * Cria ou atualiza a memória na lista de destino como o agente `opex/mentor` (token próprio, `read+write`):
 * origem `{ source: "mentor", label: "Mentor · <tarefa>" }` e auditoria com `ator: agente:mentor`, a
 * mesa, a tarefa e o destino.
 */
async function applyProposal(run: Pick<IMentorRun, "_id" | "workbenchId" | "taskCode">, proposal: MentorProposal, actorId: string) {
    const agent = { consumer: MENTOR_MEMORY_SOURCE, label: `Mentor · ${run.taskCode}` }
    const auditContext = { origem: "Agente Mentor", execucao: String(run._id), mesa: run.workbenchId, tarefa: run.taskCode, destino: proposal.target }
    const options: AgentMemoryWriteOptions = { agent, auditContext, centralId: proposal.centralId }
    const update = proposal.action === "update" && proposal.memoryId
    const result = update ? await updateTargetMemory(proposal.target, proposal.memoryId!, proposal.text, actorId, options) : await createTargetMemory(proposal.target, proposal.text, actorId, options)
    return { status: (update ? "updated" : "created") as MentorRunStatus, memoryId: result.memory.id }
}

/** Nome da lista no aviso da mesa ("do Agente Adversário", "do agente desenvolvedor (da central)"…). */
const targetPhrase: Record<MentorTarget, string> = {
    adversarial: "do Agente Adversário",
    "developer-global": "do agente desenvolvedor (globais)",
    "developer-central": "do agente desenvolvedor (desta central)",
}

/** Executa o pipeline de uma execução já registrada (`queued`). Nunca lança: falha vira `failed`. */
export async function processMentorRun(runId: string, input: MentorRunInput, settings: MentorSettings): Promise<MentorRunStatus> {
    const startedAt = Date.now()
    const usage: StepUsage = { costUsd: 0 }
    const finish = async (status: MentorRunStatus, set: Partial<IMentorRun> = {}) => {
        await setRun(runId, { status, ...set, costUsd: usage.costUsd, durationMs: Date.now() - startedAt, finishedAt: new Date() })
        await recordAudit({ userId: getLocalUser().id, entidade: MENTOR_AUDIT_ENTITY, entidadeId: runId, acao: AcaoAuditoria.EXECUTAR, depois: { status, tarefa: input.taskCode, mesa: input.workbenchId, origens: input.case.sources, memoria: set.memoryId ?? null, ...(set.target ? { destino: set.target } : {}) } })
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

        const decision = await decide(settings, state, subject, usage)
        await setRun(runId, { score: decision.score, deciderReason: decision.reason })
        if (!passesThreshold(decision.score, settings.level)) return await finish("skipped")

        const { provider, model, variant, instructions } = settings.writer
        if (!provider || !model) throw new Error("O redator do Agente Mentor não tem provedor e modelo configurados")
        const lists = await Promise.all(enabledTargets(settings.targets).map(async (target) => ({ target, memories: await listTargetMemories(target, input.centralId) })))
        const summaries: TargetSummaries[] = lists.map((list) => ({ target: list.target, summaries: list.memories.map((memory) => memory.summary) }))
        const routed = await route(settings, state, summaries, subject, usage)
        const target = routed.target
        await setRun(runId, { target, routerConfidence: routed.confidence, routerReason: routed.reason, routerProbabilities: routed.probabilities })
        const memories = lists.find((list) => list.target === target)?.memories ?? []
        const others = summaries.filter((list) => list.target !== target)
        const sanitizeContext: SanitizeContext = {
            allowPaths: target === "developer-central",
            taskCode: input.taskCode,
            taskTitle: input.taskTitle,
            projectName: input.projectName,
            repo: input.repo,
            sources: [input.case.userMessage, ...input.case.responses.map((response) => response.text)],
        }
        let rejection: string | null = null
        for (let attempt = 0; attempt < 2; attempt++) {
            const text = await generate(
                { provider, model, variant, instructions: buildWriterInstructions(instructions, target), prompt: buildWriterPrompt(state, memories, rejection, target, others), timeoutSeconds: settings.timeoutSeconds, origin: MENTOR_WRITER_CONSUMPTION_ORIGIN, subject },
                usage,
            )
            const answer = parseWriterAnswer(text)
            if (!answer) throw new Error("O redator do Agente Mentor respondeu sem o JSON esperado")
            if (answer.action === "skip") return await finish("skipped", { writerAction: "skip", writerReason: answer.reason || null })
            rejection = sanitizeMemoryText(answer.text, sanitizeContext)
            await setRun(runId, { writerAction: answer.action, writerReason: answer.reason || null, sanitizerReason: rejection })
            if (rejection) continue
            const proposal: MentorProposal = { ...resolveWriterAction(answer, memories.map((memory) => memory.id)), target, centralId: centralOf(target, input.centralId) }
            if (settings.saveMode === "suggest") {
                await notice(input.workbenchId, "info", `O Agente Mentor sugeriu uma memória ${targetPhrase[target]}: aprove ou descarte em Integrações › Inteligência Artificial › Agente Mentor.`)
                return await finish("suggested", { proposal })
            }
            const applied = await applyProposal({ _id: new Types.ObjectId(runId), workbenchId: input.workbenchId, taskCode: input.taskCode }, proposal, getLocalUser().id)
            await notice(input.workbenchId, "info", applied.status === "updated" ? `O Agente Mentor atualizou uma memória ${targetPhrase[target]} com a lição deste turno.` : `O Agente Mentor registrou uma memória nova ${targetPhrase[target]} com a lição deste turno.`)
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

/**
 * Aprovar a sugestão (texto e destino opcionalmente trocados): grava a memória na lista escolhida.
 * Trocar a lista transforma uma fusão (`update`) em memória nova; a central excluída depois da
 * sugestão devolve 409 (a sugestão volta a aguardar e pode ir para outra lista).
 */
export async function approveMentorRun(id: string, text: string | undefined, actorId: string, target?: MentorTarget): Promise<MentorRunDto> {
    const run = await claimSuggestion(id)
    const saved = proposalOf(run)!
    const nextTarget = target ?? saved.target
    const moved = nextTarget !== saved.target
    const proposal: MentorProposal = {
        action: moved ? "create" : saved.action,
        memoryId: moved ? null : saved.memoryId,
        text: text?.trim() || saved.text,
        target: nextTarget,
        centralId: centralOf(nextTarget, saved.centralId ?? run.centralId),
    }
    let applied: Awaited<ReturnType<typeof applyProposal>>
    try {
        const exists = proposal.action === "update" && proposal.memoryId ? (await listTargetMemories(proposal.target, proposal.centralId)).some((memory) => memory.id === proposal.memoryId) : false
        applied = await applyProposal(run, exists ? proposal : { ...proposal, action: "create", memoryId: null }, actorId)
    } catch (error) {
        await releaseSuggestion(run)
        if (error instanceof DomainError && error.code === "CENTRAL_NOT_FOUND") throw new DomainError(409, `A central desta execução foi excluída: escolha outro destino que não "${MENTOR_TARGET_LABELS["developer-central"].label}"`, "MENTOR_CENTRAL_GONE")
        throw error
    }
    await MentorRun.updateOne({ _id: run._id }, { $set: { status: applied.status, memoryId: applied.memoryId, proposal, target: proposal.target } })
    await recordAudit({ userId: actorId, entidade: MENTOR_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.APROVAR, depois: { status: applied.status, memoria: applied.memoryId, tarefa: run.taskCode, destino: proposal.target } })
    await publish(id)
    return toMentorRunDto({ ...run, status: applied.status, memoryId: applied.memoryId, proposal, target: proposal.target })
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
