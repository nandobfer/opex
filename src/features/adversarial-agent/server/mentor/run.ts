import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { getLocalUser } from "@/lib/local-user"
import { publishAppEvent } from "@/lib/pusher/channels"
import { flushWorkbenchEvents, prepareHub, publishWorkbenchEvent } from "@/features/agentic/server/hub"
import type { WorkbenchNoticeMemoryRef } from "@/features/agentic/types"
import { noticeMemoryRef } from "@/features/ai/memory-notice"
import {
    MENTOR_AUDIT_ENTITY,
    MENTOR_DECISION_CONSUMPTION_ORIGIN,
    MENTOR_MEMORY_SOURCE,
    MENTOR_PAGE_LIMIT,
    MENTOR_ROUTER_CONSUMPTION_ORIGIN,
    MENTOR_TARGET_LABELS,
    MENTOR_UPDATED_EVENT,
    MENTOR_WRITER_ATTEMPTS,
    MENTOR_WRITER_CONSUMPTION_ORIGIN,
    type MentorRunStatus,
    type MentorTarget,
} from "../../mentor/constants"
import { checkWriterSkip, parseDeciderAnswer, parseRouterAnswer, parseWriterAnswer, passesThreshold, resolveSplitAction, resolveWriterAction, routerChoiceOf } from "../../mentor/decision"
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
    type WriterOtherList,
} from "../../mentor/prompt"
import { sanitizeMemoryText, type SanitizeContext } from "../../mentor/sanitize"
import { enabledTargets, type MentorRunListQuery, type MentorSettings } from "../../mentor/schemas"
import type { MentorProposal, MentorRunDto, MentorRunListDto, MentorRunMemoryDto } from "../../mentor/types"
import { AdversarialReview } from "../models"
import { createAgentMemory, getAgentMemory, updateAgentMemory, type AgentMemoryWriteOptions } from "@/features/ai/server/agent-memory-service"
import { pageInfo } from "@/lib/list/query"
import { listCentralOptions } from "../central-options"
import { buildMentorRunListFilter } from "./list-query"
import { MentorRun, mentorDb, type IMentorRun } from "./models"
import { centralOf, generate, listTargetMemories, log, targetTextMax, type StepUsage } from "./steps"

/**
 * Pipeline de uma execução do Agente Mentor: contexto → decisor (JEV ou texto, nota contra o limiar
 * do slider) → Triador (escolhe UMA lista entre as ligadas) → redator (regra para aquela lista +
 * deduplicação/fusão; OPE-132: cobertura em outra lista nunca é skip e a lição pode ser separada
 * entre as globais e a central) → sanitizador → grava a memória (ou deixa como sugestão). Roda em
 * segundo plano: nunca afeta a mesa.
 */

const publish = (runId: string) => publishAppEvent(MENTOR_UPDATED_EVENT, { runId }).catch(() => undefined)

async function setRun(runId: string, set: Partial<IMentorRun>): Promise<void> {
    await MentorRun.updateOne({ _id: runId }, { $set: set })
    await publish(runId)
}

/** Resumo de cada lista ligada (o Triador escolhe pelo que cada uma já cobre). */
const summariesOf = (lists: { target: MentorTarget; memories: { id: string; summary: string; text: string }[] }[]): TargetSummaries[] =>
    lists.map((list) => ({ target: list.target, summaries: list.memories.map((memory) => memory.summary) }))

/** As duas listas do agente desenvolvedor: únicas que aceitam a parte separada da lição. */
const isDeveloperTarget = (target: MentorTarget) => target === "developer-global" || target === "developer-central"

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

function notice(workbenchId: string, level: "info" | "warn", message: string, memories?: WorkbenchNoticeMemoryRef[]): Promise<void> {
    return (async () => {
        await prepareHub(workbenchId)
        publishWorkbenchEvent(workbenchId, { type: "notice", level, message, ...(memories?.length ? { memories } : {}) })
        await flushWorkbenchEvents(workbenchId)
    })().catch(() => undefined)
}

/** Proposta gravada (execuções de antes do Triador não têm destino: são do adversário). */
function proposalOf(run: Pick<IMentorRun, "proposal" | "centralId">): MentorProposal | null {
    if (!run.proposal) return null
    const target = run.proposal.target ?? "adversarial"
    return { action: run.proposal.action, memoryId: run.proposal.memoryId, text: run.proposal.text, target, centralId: centralOf(target, run.proposal.centralId ?? run.centralId) }
}

/** Parte separada gravada (OPE-132); antigas não têm. */
function extraProposalOf(run: Pick<IMentorRun, "extraProposal" | "centralId">): MentorProposal | null {
    if (!run.extraProposal) return null
    return { ...run.extraProposal, centralId: centralOf(run.extraProposal.target, run.extraProposal.centralId ?? run.centralId) }
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

export function toMentorRunDto(run: IMentorRun): MentorRunDto {
    return {
        id: String(run._id),
        workbenchId: run.workbenchId,
        centralId: run.centralId,
        taskId: run.taskId,
        taskTitle: run.taskTitle,
        taskCode: run.taskCode,
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
        writerSkipKind: run.writerSkipKind ?? null,
        writerCoveredBy: run.writerCoveredBy ?? null,
        skipRejection: run.skipRejection ?? null,
        splitRejection: run.splitRejection ?? null,
        sanitizerReason: run.sanitizerReason,
        proposal: proposalOf(run),
        extraProposal: extraProposalOf(run),
        memoryId: run.memoryId,
        extraMemoryId: run.extraMemoryId ?? null,
        error: run.error,
        costUsd: run.costUsd ?? 0,
        durationMs: run.durationMs,
        createdAt: new Date(run.createdAt).toISOString(),
        finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
    }
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
    const result = update
        ? await updateAgentMemory(proposal.target, proposal.memoryId!, proposal.text, actorId, options)
        : await createAgentMemory(proposal.target, proposal.text, actorId, options)
    return { status: (update ? "updated" : "created") as MentorRunStatus, memoryId: result.memoria.id }
}

/** Referência da memória gravada para o aviso da mesa (o painel lê a memória do Engramind ao abrir). */
const appliedRef = (proposal: MentorProposal, applied: { status: MentorRunStatus; memoryId: string }): WorkbenchNoticeMemoryRef =>
    noticeMemoryRef(proposal.target, { id: applied.memoryId }, applied.status === "updated" ? "updated" : "created", { centralId: proposal.centralId ?? undefined })

/** Nome da lista no aviso da mesa ("do Agente Adversário", "do agente desenvolvedor (da central)"…). */
const targetPhrase: Record<MentorTarget, string> = {
    adversarial: "do Agente Adversário",
    "developer-global": "do agente desenvolvedor (globais)",
    "developer-central": "do agente desenvolvedor (desta central)",
}

/** Contexto do sanitizador para uma lista de destino (caminhos e limite variam com a lista). */
async function sanitizeContextOf(input: MentorRunInput, target: MentorTarget, centralId: string | null): Promise<SanitizeContext> {
    return {
        textMax: await targetTextMax(target, centralOf(target, centralId)),
        allowPaths: target === "developer-central",
        taskCode: input.taskCode,
        taskTitle: input.taskTitle,
        projectName: input.projectName,
        repo: input.repo,
        sources: [input.case.userMessage, ...input.case.responses.map((response) => response.text)],
    }
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
        const summaries = summariesOf(lists)
        const routed = await route(settings, state, summaries, subject, usage)
        const target = routed.target
        await setRun(runId, { target, routerConfidence: routed.confidence, routerReason: routed.reason, routerProbabilities: routed.probabilities })
        const memories = lists.find((list) => list.target === target)?.memories ?? []
        // As duas listas do desenvolvedor vão com os textos (ids) para a parte separada; as demais, só resumos.
        const others: WriterOtherList[] = summaries
            .filter((list) => list.target !== target)
            .map((list) => ({ ...list, ...(isDeveloperTarget(target) && isDeveloperTarget(list.target) ? { memories: lists.find((item) => item.target === list.target)?.memories ?? [] } : {}) }))
        const destinationIds = memories.map((memory) => memory.id)
        const otherIds = others.flatMap((list) => list.memories?.map((memory) => memory.id) ?? [])
        const sanitizeContext = await sanitizeContextOf(input, target, input.centralId)

        let rejection: string | null = null
        let skipRejection: string | null = null
        let splitRejection: string | null = null
        for (let attempt = 0; attempt < MENTOR_WRITER_ATTEMPTS; attempt++) {
            const text = await generate(
                {
                    provider,
                    model,
                    variant,
                    instructions: buildWriterInstructions(instructions, target),
                    prompt: buildWriterPrompt(state, memories, rejection ?? skipRejection, target, others),
                    timeoutSeconds: settings.timeoutSeconds,
                    origin: MENTOR_WRITER_CONSUMPTION_ORIGIN,
                    subject,
                },
                usage,
            )
            const answer = parseWriterAnswer(text)
            if (!answer) throw new Error("O redator do Agente Mentor respondeu sem o JSON esperado")
            if (answer.action === "skip") {
                const refused = checkWriterSkip(answer, destinationIds, otherIds)
                const citedId = answer.memoryId ?? answer.reason?.match(/\bm_[A-Za-z0-9]+\b/)?.[0] ?? null
                const covered = answer.kind === "covered" && citedId && destinationIds.includes(citedId) ? { memoryId: citedId, target } : null
                if (!refused) return await finish("skipped", { writerAction: "skip", writerReason: answer.reason || null, writerSkipKind: answer.kind ?? null, writerCoveredBy: covered, skipRejection })
                skipRejection = refused
                await setRun(runId, { writerAction: "skip", writerReason: answer.reason || null, writerSkipKind: answer.kind ?? null, writerCoveredBy: null, skipRejection })
                continue
            }
            rejection = sanitizeMemoryText(answer.text, sanitizeContext)
            // A parte separada: só entre as duas listas do desenvolvedor, com as duas ligadas.
            let splitBlocked: string | null = null
            const split = answer.split
            if (split) {
                if (!isDeveloperTarget(target) || !isDeveloperTarget(split.target) || split.target === target || !lists.some((list) => list.target === split.target)) {
                    splitBlocked = "A parte separada só vale entre as duas listas do agente desenvolvedor, com as duas ligadas e destinos diferentes."
                } else {
                    const splitContext = await sanitizeContextOf(input, split.target, input.centralId)
                    splitBlocked = sanitizeMemoryText(split.text, splitContext)
                }
                splitRejection = splitBlocked
            }
            await setRun(runId, { writerAction: answer.action, writerReason: answer.reason || null, sanitizerReason: rejection, splitRejection })
            if (rejection) continue
            const proposal: MentorProposal = { ...resolveWriterAction(answer, destinationIds), target, centralId: centralOf(target, input.centralId) }
            // A parte recusada pelo sanitizador (ou fora das regras) não derruba a principal: fica registrada.
            const splitMemories = split && !splitBlocked ? (lists.find((list) => list.target === split.target)?.memories ?? []) : []
            const extra: MentorProposal | null =
                split && !splitBlocked ? { ...resolveSplitAction(split, splitMemories.map((memory) => memory.id)), target: split.target, centralId: centralOf(split.target, input.centralId) } : null
            if (settings.saveMode === "suggest") {
                const suggestions: WorkbenchNoticeMemoryRef[] = [{ kind: "suggestion", mentorRunId: runId, part: "main" }, ...(extra ? [{ kind: "suggestion" as const, mentorRunId: runId, part: "extra" as const }] : [])]
                await notice(input.workbenchId, "info", `O Agente Mentor sugeriu uma memória ${targetPhrase[target]}: aprove ou descarte em Integrações › Inteligência Artificial › Agente Mentor.`, suggestions)
                return await finish("suggested", { proposal, extraProposal: extra })
            }
            const applied = await applyProposal({ _id: new Types.ObjectId(runId), workbenchId: input.workbenchId, taskCode: input.taskCode }, proposal, getLocalUser().id)
            let extraApplied: { status: MentorRunStatus; memoryId: string } | null = null
            if (extra) {
                extraApplied = await applyProposal({ _id: new Types.ObjectId(runId), workbenchId: input.workbenchId, taskCode: input.taskCode }, extra, getLocalUser().id).catch((error: unknown) => {
                    // A principal já foi gravada: a parte separada fica como falha registrada, sem desfazer a outra.
                    splitRejection = error instanceof Error ? error.message : String(error)
                    log.warn({ err: error, runId }, "[adversarial-agent] Parte separada da lição não foi gravada")
                    return null
                })
            }
            const phrase = extraApplied ? `${targetPhrase[target]} e ${targetPhrase[extra!.target]}` : targetPhrase[target]
            const written = [appliedRef(proposal, applied), ...(extraApplied ? [appliedRef(extra!, extraApplied)] : [])]
            await notice(input.workbenchId, "info", applied.status === "updated" ? `O Agente Mentor atualizou uma memória ${phrase} com a lição deste turno.` : `O Agente Mentor registrou uma memória nova ${phrase} com a lição deste turno.`, written)
            return await finish(applied.status, { proposal, memoryId: applied.memoryId, ...(extraApplied ? { extraProposal: extra, extraMemoryId: extraApplied.memoryId } : {}), splitRejection })
        }
        return await finish("discarded", { sanitizerReason: rejection, skipRejection, splitRejection })
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

/**
 * Resumo da memória gravada por uma execução (OPE-128), lido do Engramind na hora: o título é gerado
 * depois da gravação, então não fica guardado na execução. Sem memória → `none`; excluída ou movida → `missing`.
 */
export async function getMentorRunMemory(id: string): Promise<MentorRunMemoryDto> {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Execução não encontrada", "MENTOR_RUN_NOT_FOUND")
    await mentorDb()
    const run = (await MentorRun.findById(id).lean()) as IMentorRun | null
    if (!run) throw new DomainError(404, "Execução não encontrada", "MENTOR_RUN_NOT_FOUND")
    const proposal = proposalOf(run)
    if (!run.memoryId || !proposal) return { state: "none", resumo: null, resumoPendente: false, atualizadaEm: null }
    try {
        const memory = await getAgentMemory(proposal.target, run.memoryId, proposal.centralId)
        return { state: "ok", resumo: memory.resumo, resumoPendente: memory.resumoPendente, atualizadaEm: memory.atualizadaEm ?? null }
    } catch (error) {
        if (error instanceof DomainError && error.status === 404) return { state: "missing", resumo: null, resumoPendente: false, atualizadaEm: null }
        throw error
    }
}

/** Uma execução (o painel da sugestão no aviso da mesa lê a proposta onde ela está gravada). */
export async function getMentorRun(id: string): Promise<MentorRunDto> {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Execução não encontrada", "MENTOR_RUN_NOT_FOUND")
    await mentorDb()
    const run = (await MentorRun.findById(id).lean()) as IMentorRun | null
    if (!run) throw new DomainError(404, "Execução não encontrada", "MENTOR_RUN_NOT_FOUND")
    return toMentorRunDto(run)
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
 *
 * OPE-132: a parte separada (global + central) é gravada na lista dela; `includeExtra: false` a
 * descarta. Uma falha devolve a sugestão a aguardar e, na nova tentativa, o que já foi gravado
 * (`memoryId`/`extraMemoryId`) não é repetido.
 */
export async function approveMentorRun(id: string, text: string | undefined, actorId: string, target?: MentorTarget, extra?: { text?: string; include?: boolean }): Promise<MentorRunDto> {
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
    const savedExtra = extraProposalOf(run)
    const extraProposal: MentorProposal | null =
        savedExtra && extra?.include !== false && !(savedExtra.target === proposal.target && savedExtra.centralId === proposal.centralId)
            ? { ...savedExtra, text: extra?.text?.trim() || savedExtra.text }
            : null
    let applied: Awaited<ReturnType<typeof applyProposal>> | null = null
    let extraApplied: Awaited<ReturnType<typeof applyProposal>> | null = null
    try {
        if (extraProposal && !run.extraMemoryId) {
            // Como na principal: a memória da fusão pode ter sido excluída depois da sugestão.
            const extraExists = extraProposal.action === "update" && extraProposal.memoryId ? (await listTargetMemories(extraProposal.target, extraProposal.centralId)).some((memory) => memory.id === extraProposal.memoryId) : false
            extraApplied = await applyProposal(run, extraExists ? extraProposal : { ...extraProposal, action: "create", memoryId: null }, actorId)
            await MentorRun.updateOne({ _id: run._id }, { $set: { extraMemoryId: extraApplied.memoryId } })
        }
        if (!run.memoryId) {
            const exists = proposal.action === "update" && proposal.memoryId ? (await listTargetMemories(proposal.target, proposal.centralId)).some((memory) => memory.id === proposal.memoryId) : false
            applied = await applyProposal(run, exists ? proposal : { ...proposal, action: "create", memoryId: null }, actorId)
            await MentorRun.updateOne({ _id: run._id }, { $set: { memoryId: applied.memoryId } })
        }
    } catch (error) {
        await releaseSuggestion(run)
        if (error instanceof DomainError && error.code === "CENTRAL_NOT_FOUND") throw new DomainError(409, `A central desta execução foi excluída: escolha outro destino que não "${MENTOR_TARGET_LABELS["developer-central"].label}"`, "MENTOR_CENTRAL_GONE")
        throw error
    }
    const status = applied?.status ?? (run.writerAction === "update" ? "updated" : "created")
    const memoryId = applied?.memoryId ?? run.memoryId
    // Descarte explícito (`includeExtra: false`) ou lista que passou a coincidir com a principal: sem parte separada.
    const storedExtra = extraProposal ? (run.extraProposal ?? null) : null
    const extraMemoryId = extraApplied?.memoryId ?? run.extraMemoryId ?? null
    await MentorRun.updateOne({ _id: run._id }, { $set: { status, memoryId, extraMemoryId, proposal, extraProposal: storedExtra, target: proposal.target } })
    await recordAudit({ userId: actorId, entidade: MENTOR_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.APROVAR, depois: { status, memoria: memoryId, extra: extraMemoryId, tarefa: run.taskCode, destino: proposal.target, ...(extraProposal ? { destinoExtra: extraProposal.target } : {}) } })
    await publish(id)
    return toMentorRunDto({ ...run, status, memoryId, extraMemoryId, proposal, extraProposal: storedExtra, target: proposal.target } as IMentorRun)
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
