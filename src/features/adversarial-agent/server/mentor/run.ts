import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { publishAppEvent } from "@/lib/pusher/channels"
import { MENTOR_AUDIT_ENTITY, MENTOR_MEMORY_SOURCE, MENTOR_PAGE_LIMIT, MENTOR_PAGE_LIMIT_MAX, MENTOR_TARGET_LABELS, MENTOR_UPDATED_EVENT, type MentorRunStatus, type MentorTarget } from "../../mentor/constants"
import type { MentorRunListQuery } from "../../mentor/schemas"
import type { MentorLearningRunDto, MentorProposal, MentorRunCaseDto, MentorRunDto, MentorRunListDto, MentorRunMemoryDto } from "../../mentor/types"
import { createAgentMemory, getAgentMemory, updateAgentMemory, type AgentMemoryWriteOptions } from "@/features/ai/server/agent-memory-service"
import { pageInfo } from "@/lib/list/query"
import { listCentralOptions } from "../central-options"
import { buildMentorRunListFilter } from "./list-query"
import { MentorRun, MentorRunCase, mentorDb, type IMentorRun, type IMentorRunCase } from "./models"
import { centralOf, listTargetMemories } from "./steps"

/**
 * Execuções do Agente Mentor: DTO, listas (página do Mentor e aba Aprendizado da mesa), Tentar novamente
 * e a decisão das sugestões antigas (modo Sugerir, que saiu na OPE-165). O pipeline do aprendizado na
 * conclusão está em `learn.ts`.
 */

const publish = (runId: string) => publishAppEvent(MENTOR_UPDATED_EVENT, { runId }).catch(() => undefined)


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

export function toMentorRunDto(run: IMentorRun, canRetry = false): MentorRunDto {
    return {
        id: String(run._id),
        kind: run.kind === "learning" ? "learning" : "legacy",
        completedAt: run.completedAt ? new Date(run.completedAt).toISOString() : null,
        attempt: run.attempt ?? null,
        completionKind: run.completionKind ?? null,
        transcript: run.transcript ?? null,
        digestModel: run.digestModel ?? null,
        caseCount: run.caseCount ?? null,
        digestDiscarded: run.digestDiscarded ?? null,
        operationCounts: run.operationCounts ?? null,
        budgetUsd: run.budgetUsd ?? null,
        abortReason: run.abortReason ?? null,
        canRetry,
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
    return { items: rows.map((row) => toMentorRunDto(row)), ...pageInfo(page, limit, total), centrals }
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

// ── Aprendizado na conclusão (OPE-165) ─────────────────────────────────────

function toCaseDto(item: IMentorRunCase): MentorRunCaseDto {
    return {
        id: String(item._id),
        index: item.index,
        lesson: item.lesson,
        evidence: item.evidence ?? [],
        nature: item.nature,
        scope: item.scope,
        detection: item.detection ?? null,
        status: item.status,
        score: item.score ?? null,
        deciderReason: item.deciderReason ?? null,
        target: item.target ?? null,
        routerReason: item.routerReason ?? null,
        writerReason: item.writerReason ?? null,
        skipKind: item.skipKind ?? null,
        coveredBy: item.coveredBy ?? null,
        rejection: item.rejection ?? null,
        operations: (item.operations ?? []).map((operation) => ({ ...operation, absorbed: operation.absorbed ?? [] })),
        error: item.error ?? null,
    }
}

/**
 * Repetíveis: em cada conclusão, a tentativa mais recente quando ela falhou e nenhuma outra da mesma
 * conclusão está na fila ou rodando.
 */
export function retryableRunIds(runs: readonly Pick<IMentorRun, "_id" | "kind" | "completedAt" | "attempt" | "status">[]): Set<string> {
    const groups = new Map<string, typeof runs[number][]>()
    for (const run of runs) {
        if (run.kind !== "learning" || !run.completedAt) continue
        const key = new Date(run.completedAt).toISOString()
        groups.set(key, [...(groups.get(key) ?? []), run])
    }
    const ids = new Set<string>()
    for (const group of groups.values()) {
        if (group.some((run) => run.status === "queued" || run.status === "running")) continue
        const latest = [...group].sort((a, b) => (b.attempt ?? 1) - (a.attempt ?? 1))[0]
        if (latest?.status === "failed") ids.add(String(latest._id))
    }
    return ids
}

/** Execuções de aprendizado de uma mesa (aba "Aprendizado"), mais recentes primeiro, com os casos. */
export async function listWorkbenchMentorRuns(workbenchId: string): Promise<MentorLearningRunDto[]> {
    await mentorDb()
    const runs = (await MentorRun.find({ workbenchId, kind: "learning" }).sort({ createdAt: -1 }).limit(MENTOR_PAGE_LIMIT_MAX).lean()) as unknown as IMentorRun[]
    if (!runs.length) return []
    const cases = (await MentorRunCase.find({ runId: { $in: runs.map((run) => String(run._id)) } }).sort({ index: 1 }).lean()) as unknown as IMentorRunCase[]
    const retryable = retryableRunIds(runs)
    return runs.map((run) => ({ ...toMentorRunDto(run, retryable.has(String(run._id))), cases: cases.filter((item) => item.runId === String(run._id)).map(toCaseDto) }))
}

/** Uma execução de aprendizado com os casos (detalhe aberto da página do Mentor). */
export async function getMentorLearningRun(id: string): Promise<MentorLearningRunDto> {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Execução não encontrada", "MENTOR_RUN_NOT_FOUND")
    await mentorDb()
    const run = (await MentorRun.findById(id).lean()) as IMentorRun | null
    if (!run) throw new DomainError(404, "Execução não encontrada", "MENTOR_RUN_NOT_FOUND")
    const siblings = run.kind === "learning" ? ((await MentorRun.find({ workbenchId: run.workbenchId, kind: "learning", completedAt: run.completedAt }).select({ kind: 1, completedAt: 1, attempt: 1, status: 1 }).lean()) as unknown as IMentorRun[]) : []
    const cases = (await MentorRunCase.find({ runId: id }).sort({ index: 1 }).lean()) as unknown as IMentorRunCase[]
    return { ...toMentorRunDto(run, retryableRunIds(siblings).has(id)), cases: cases.map(toCaseDto) }
}
