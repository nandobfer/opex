import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { publishAppEvent } from "@/lib/pusher/channels"
import { getAgentMemory, listAgentMemories, moveAgentMemory, updateAgentMemory, type AgentMemoryWriteOptions } from "@/features/ai/server/agent-memory-service"
import type { MemoryDto } from "@/features/ai/types"
import {
    MENTOR_MEMORY_SOURCE,
    MENTOR_REORG_AUDIT_ENTITY,
    MENTOR_REORG_DECIDABLE_STATUSES,
    MENTOR_REORG_HISTORY_LIMIT,
    MENTOR_REORG_ROUTER_CONSUMPTION_ORIGIN,
    MENTOR_REORG_UPDATED_EVENT,
    MENTOR_REORG_WRITER_ATTEMPTS,
    MENTOR_REORG_WRITER_CONSUMPTION_ORIGIN,
    MENTOR_TARGET_LABELS,
    type MentorReorgAction,
    type MentorReorgStatus,
    type MentorTarget,
} from "../../mentor/constants"
import { parseReorgRouterAnswer, parseReorgWriterAnswer } from "../../mentor/decision"
import { buildJevReorgRouterQuestions, buildReorgRouterInstructions, buildReorgRouterPrompt, buildReorgRouterState, buildReorgWriterPrompt, MENTOR_REORG_WRITER_INSTRUCTIONS, type ReorgTargetOption } from "../../mentor/prompt"
import { moveAllowed, parseReorgTargetValue, planItemAction, reconcileReorgPlan, reorgTargetValue, type ReorgMemorySnapshot, type ReorgPlanItem } from "../../mentor/reorg"
import { sanitizeMemoryText, type SanitizeContext } from "../../mentor/sanitize"
import { enabledTargets, type MentorReorgApplyInput, type MentorReorgDiscardInput, type MentorSettings } from "../../mentor/schemas"
import type { MentorReorgDto, MentorReorgItemDto, MentorReorgListDto, MentorReorgPreviewDto, MentorReorgSummaryDto } from "../../mentor/types"
import { listCentralOptions } from "../central-options"
import { MentorReorg, MentorReorgItem, reorgDb, type IMentorReorg, type IMentorReorgItem } from "./reorg-models"
import { generate, log, targetTextMax, type StepUsage } from "./steps"

/**
 * Reorganização do acervo do Agente Mentor (OPE-132): lê todas as memórias que o Mentor enxerga e,
 * para cada uma, passa pela triagem (lista de destino) e pela redação em modo de revisão. O resultado
 * é um **Plano de reorganização** — nada é gravado até o dono aprovar (tudo ou item a item). Aplicar
 * usa o mesmo serviço de memórias do Mentor (auditoria `MemoriaAgente`, ator `agente:mentor`); fundir
 * arquiva a memória absorvida (a do dono só com confirmação explícita).
 */

const publishReorg = (reorgId: string) => publishAppEvent(MENTOR_REORG_UPDATED_EVENT, { reorgId }).catch(() => undefined)

/** Lista do recorte: o destino, a central (na lista por central) e o nome exibido. */
export interface ReorgList {
    target: MentorTarget
    centralId: string | null
    label: string
    projectName: string | null
}

export interface ResolvedReorgScope {
    lists: ReorgList[]
    targets: MentorTarget[]
    centralIds: string[]
}

const listLabel = (target: MentorTarget, projectName: string | null) => (target === "developer-central" && projectName ? `${MENTOR_TARGET_LABELS[target].label} · ${projectName}` : MENTOR_TARGET_LABELS[target].label)

/** Recorte efetivo: listas ligadas no Mentor (subconjunto pedido) × centrais no escopo dele. */
export interface ReorgScopeRequest {
    targets?: MentorTarget[]
    centralIds?: string[]
}

export async function resolveReorgScope(input: ReorgScopeRequest, settings: MentorSettings): Promise<ResolvedReorgScope> {
    const enabled = enabledTargets(settings.targets)
    if (!enabled.length) throw new DomainError(400, "O Agente Mentor não tem listas de destino ligadas: escolha ao menos uma na configuração", "MENTOR_REORG_NO_TARGETS")
    const targets = input.targets?.length ? enabled.filter((target) => input.targets!.includes(target)) : enabled
    if (!targets.length) throw new DomainError(400, "Escolha ao menos uma lista para revisar", "MENTOR_REORG_SCOPE_EMPTY")
    const centrals = await listCentralOptions()
    const scoped = settings.scope.all ? centrals : centrals.filter((central) => settings.scope.centralIds.includes(central.id))
    const requested = (input.centralIds ?? []).filter((id) => scoped.some((central) => central.id === id))
    if (input.centralIds?.length && !requested.length) throw new DomainError(400, "Nenhuma das centrais escolhidas está no escopo do Agente Mentor", "MENTOR_REORG_SCOPE_EMPTY")
    const chosen = requested.length ? scoped.filter((central) => requested.includes(central.id)) : scoped
    const lists = targets.flatMap<ReorgList>((target) =>
        target === "developer-central"
            ? chosen.map((central) => ({ target, centralId: central.id, label: listLabel(target, central.projectName ?? null), projectName: central.projectName ?? null }))
            : [{ target, centralId: null, label: listLabel(target, null), projectName: null }],
    )
    if (!lists.length) throw new DomainError(400, "Não há memórias a revisar neste recorte", "MENTOR_REORG_SCOPE_EMPTY")
    return { lists, targets, centralIds: chosen.map((central) => central.id) }
}

const optionOf = (list: ReorgList): ReorgTargetOption => ({
    value: reorgTargetValue(list.target, list.centralId),
    target: list.target,
    centralId: list.centralId,
    label: list.label,
    criteria: `${MENTOR_TARGET_LABELS[list.target].criteria}${list.projectName ? ` (o projeto desta lista é "${list.projectName}")` : ""}`,
})

/** Quantas memórias o recorte tem (para a confirmação da interface). */
export async function previewMentorReorg(input: { targets?: MentorTarget[]; centralIds?: string[] }, settings: MentorSettings): Promise<MentorReorgPreviewDto> {
    const scope = await resolveReorgScope(input, settings)
    await reorgDb()
    const counts = await Promise.all(scope.lists.map(async (list) => (await listAgentMemories(list.target, list.centralId)).filter((memory) => memory.ativa !== false)))
    const memories = counts.reduce((sum, list) => sum + list.length, 0)
    const past = (await MentorReorg.find({ status: { $in: ["ready", "applied", "partial"] }, done: { $gt: 0 } }).sort({ createdAt: -1 }).limit(10).lean()) as IMentorReorg[]
    const average = past.length ? past.reduce((sum, run) => sum + (run.costUsd ?? 0) / Math.max(1, run.done), 0) / past.length : null
    return { memories, calls: memories * (scope.lists.length > 1 ? 2 : 1), averageCostUsdPerMemory: average }
}

/** Contexto do sanitizador: no destino global/Adversário, o nome do projeto da central de origem é recusado. */
async function sanitizeContextOf(destination: ReorgList, origin: ReorgList): Promise<SanitizeContext> {
    return {
        textMax: await targetTextMax(destination.target, destination.centralId),
        allowPaths: destination.target === "developer-central",
        projectName: destination.target === "developer-central" ? null : (origin.projectName ?? null),
        taskTitle: null,
        taskCode: null,
        repo: null,
        sources: [],
    }
}

interface ReviewInput {
    memory: MemoryDto
    origin: ReorgList
    scope: ResolvedReorgScope
    acervo: Map<string, MemoryDto[]>
    options: ReorgTargetOption[]
    settings: MentorSettings
    usage: StepUsage
    subject: string
    signal: AbortSignal
}

/** Triagem: a lista onde a memória deve ficar (sem chamada quando só há uma opção). */
async function routeMemory(input: ReviewInput): Promise<{ destination: ReorgList; confidence: number | null; reason: string | null }> {
    const { settings, options, memory, origin } = input
    if (options.length === 1) return { destination: input.scope.lists[0]!, confidence: null, reason: null }
    const { provider, model, variant, instructions } = settings.router
    if (!provider || !model) throw new DomainError(400, "Configure o provedor e o modelo do Triador para revisar o acervo", "MENTOR_REORG_ROUTER_MISSING")
    const summaries = Object.fromEntries(options.map((option) => [option.value, (input.acervo.get(option.value) ?? []).map((item) => item.resumo).filter((resumo) => resumo !== memory.resumo)]))
    const state = buildReorgRouterState({ texto: memory.texto, resumo: memory.resumo }, origin.label, summaries)
    const tracking = { feature: MENTOR_REORG_ROUTER_CONSUMPTION_ORIGIN, subject: input.subject }
    let value: string
    let confidence: number | null
    let reason: string | null
    if (provider === "jev") {
        const { askJevSystemOne } = await import("@/lib/ai/jev")
        const signal = AbortSignal.any([input.signal, AbortSignal.timeout(settings.timeoutSeconds * 1000)])
        const response = await askJevSystemOne({ model, state, questions: buildJevReorgRouterQuestions(options, instructions), signal, tracking })
        const answer = response.answers?.target
        if (!answer || answer.type !== "choice") throw new Error("O JEV não respondeu a pergunta do Triador da reorganização")
        value = answer.choice
        confidence = answer.confidence
        reason = null
    } else {
        const text = await generate({ provider, model, variant, instructions: buildReorgRouterInstructions(options, instructions), prompt: buildReorgRouterPrompt(state), timeoutSeconds: settings.timeoutSeconds, origin: MENTOR_REORG_ROUTER_CONSUMPTION_ORIGIN, subject: input.subject, signal: input.signal }, input.usage)
        const parsed = parseReorgRouterAnswer(text)
        if (!parsed) throw new Error("O Triador da reorganização respondeu sem o JSON esperado")
        value = parsed.target
        confidence = parsed.confidence
        reason = parsed.reason || null
    }
    const parsed = parseReorgTargetValue(value)
    const destination = input.scope.lists.find((list) => list.target === parsed?.target && list.centralId === parsed?.centralId)
    if (!destination) throw new Error(`O Triador da reorganização escolheu um destino inválido ("${value}")`)
    return { destination, confidence, reason }
}

interface WriterResult {
    writer: { action: "keep" | "rewrite" | "merge"; text?: string; memoryId?: string; reason?: string }
    rejection: string | null
}

/** Redação: manter, reescrever ou fundir, com o sanitizador e uma nova tentativa. */
async function writeMemory(input: ReviewInput, destination: ReorgList): Promise<WriterResult> {
    const { settings, memory } = input
    const { provider, model, variant } = settings.writer
    if (!provider || !model) throw new DomainError(400, "Configure o provedor e o modelo do redator para revisar o acervo", "MENTOR_REORG_WRITER_MISSING")
    const destinationMemories = (input.acervo.get(reorgTargetValue(destination.target, destination.centralId)) ?? []).filter((item) => item.id !== memory.id)
    const context = await sanitizeContextOf(destination, input.origin)
    let rejection: string | null = null
    for (let attempt = 0; attempt < MENTOR_REORG_WRITER_ATTEMPTS; attempt++) {
        const text = await generate(
            { provider, model, variant, instructions: MENTOR_REORG_WRITER_INSTRUCTIONS, prompt: buildReorgWriterPrompt({ texto: memory.texto, resumo: memory.resumo }, destination.label, destinationMemories.map((item) => ({ id: item.id, summary: item.resumo, text: item.texto })), rejection), timeoutSeconds: settings.timeoutSeconds, origin: MENTOR_REORG_WRITER_CONSUMPTION_ORIGIN, subject: input.subject, signal: input.signal },
            input.usage,
        )
        const answer = parseReorgWriterAnswer(text)
        if (!answer) throw new Error("O redator da reorganização respondeu sem o JSON esperado")
        if (answer.action === "keep") return { writer: answer, rejection: null }
        rejection = sanitizeMemoryText(answer.text, context)
        if (!rejection) return { writer: answer, rejection: null }
    }
    return { writer: { action: "keep", reason: "A regra proposta foi recusada pelo sanitizador" }, rejection }
}

/** Uma memória revisada: triagem + redação + conciliação de texto, lista e fusão. */
async function reviewMemory(input: ReviewInput): Promise<ReorgPlanItem> {
    const routed = await routeMemory(input)
    const written = await writeMemory(input, routed.destination)
    // A própria memória nunca é candidata a fusão (o prompt já a exclui; a resolução confere de novo).
    const destinationMemories = (input.acervo.get(reorgTargetValue(routed.destination.target, routed.destination.centralId)) ?? []).filter((item) => item.id !== input.memory.id)
    const mergeTarget = written.writer.memoryId ? destinationMemories.find((item) => item.id === written.writer.memoryId) : undefined
    let action = planItemAction({
        origin: { target: input.origin.target, centralId: input.origin.centralId },
        destination: { target: routed.destination.target, centralId: routed.destination.centralId },
        writer: written.writer,
        mergeExists: Boolean(mergeTarget),
    })
    let sanitizerReason = written.rejection
    // Mover sem texto novo levaria o texto atual para outra lista: ele também passa pelo sanitizador do destino.
    if (action.action === "move" && !action.text) {
        const issue = sanitizeMemoryText(input.memory.texto, await sanitizeContextOf(routed.destination, input.origin))
        if (issue) {
            action = { action: "keep", target: input.origin.target, centralId: input.origin.centralId, text: null, mergeInto: null, note: `O texto atual não pode ser levado para ${routed.destination.label}: ${issue}` }
            sanitizerReason = issue
        }
    }
    const origin: ReorgMemorySnapshot = {
        target: input.origin.target,
        centralId: input.origin.centralId,
        memoryId: input.memory.id,
        resumo: input.memory.resumo,
        texto: input.memory.texto,
        versao: input.memory.versao,
        owner: input.memory.doDono,
    }
    return {
        memoryId: input.memory.id,
        origin,
        ...action,
        mergeIntoResumo: mergeTarget?.resumo ?? null,
        reason: written.writer.reason ?? routed.reason ?? "",
        routerConfidence: routed.confidence,
        routerReason: routed.reason,
        sanitizerReason,
        moveBlocked: !moveAllowed(origin, { target: action.target, centralId: action.centralId }),
        ownerMemory: origin.owner || Boolean(mergeTarget?.doDono),
    }
}

const abortError = () => Object.assign(new Error("Reorganização cancelada"), { name: "AbortError" })

/**
 * Executa a revisão de um plano já registrado. Nunca lança: falha/cancelamento viram o status da
 * execução. Cada memória revisada é gravada na hora (a tela vê o progresso e o cancelamento mantém o
 * que já foi revisado); a conciliação roda no fim e ajusta só os itens afetados.
 */
export async function processMentorReorg(reorgId: string, scope: ResolvedReorgScope, settings: MentorSettings, signal: AbortSignal): Promise<void> {
    const startedAt = Date.now()
    const usage: StepUsage = { costUsd: 0 }
    const finish = async (status: MentorReorgStatus, error: string | null = null) => {
        await MentorReorg.updateOne({ _id: reorgId }, { $set: { status, error, costUsd: usage.costUsd, durationMs: Date.now() - startedAt, finishedAt: new Date() } })
        await publishReorg(reorgId)
    }
    try {
        await reorgDb()
        if (signal.aborted) throw abortError()
        await MentorReorg.updateOne({ _id: reorgId }, { $set: { status: "running", startedAt: new Date() } })
        await publishReorg(reorgId)
        // Configuração ausente é falha da execução (não de uma memória).
        if (scope.lists.length > 1 && (!settings.router.provider || !settings.router.model)) throw new DomainError(400, "Configure o provedor e o modelo do Triador para revisar mais de uma lista", "MENTOR_REORG_ROUTER_MISSING")
        if (!settings.writer.provider || !settings.writer.model) throw new DomainError(400, "Configure o provedor e o modelo do redator para revisar o acervo", "MENTOR_REORG_WRITER_MISSING")
        const acervo = new Map<string, MemoryDto[]>()
        // Memórias arquivadas não entram na revisão nem são candidatas a fusão.
        for (const list of scope.lists) acervo.set(reorgTargetValue(list.target, list.centralId), (await listAgentMemories(list.target, list.centralId)).filter((memory) => memory.ativa !== false))
        const total = [...acervo.values()].reduce((sum, memories) => sum + memories.length, 0)
        await MentorReorg.updateOne({ _id: reorgId }, { $set: { total } })
        const options = scope.lists.map(optionOf)
        const planned: ReorgPlanItem[] = []
        let done = 0
        for (const list of scope.lists) {
            for (const memory of acervo.get(reorgTargetValue(list.target, list.centralId)) ?? []) {
                if (signal.aborted) throw abortError()
                let item: ReorgPlanItem
                let error: string | null = null
                try {
                    item = await reviewMemory({ memory, origin: list, scope, acervo, options, settings, usage, subject: `reorganizacao-${reorgId}`, signal })
                } catch (failure) {
                    // Uma memória com resposta inválida não invalida o plano inteiro: ela fica para decisão com o erro.
                    if (signal.aborted) throw abortError()
                    error = failure instanceof Error ? failure.message : String(failure)
                    log.warn({ err: failure, reorgId, memoryId: memory.id }, "[adversarial-agent] Memória não revisada na reorganização")
                    item = {
                        memoryId: memory.id,
                        origin: { target: list.target, centralId: list.centralId, memoryId: memory.id, resumo: memory.resumo, texto: memory.texto, versao: memory.versao, owner: memory.doDono },
                        action: "keep",
                        target: list.target,
                        centralId: list.centralId,
                        text: null,
                        mergeInto: null,
                        mergeIntoResumo: null,
                        reason: "Não foi possível revisar esta memória",
                        note: "A revisão falhou: a memória fica como está. Gere outro plano para tentar de novo.",
                        routerConfidence: null,
                        routerReason: null,
                        sanitizerReason: null,
                        moveBlocked: false,
                        ownerMemory: memory.doDono,
                    }
                }
                planned.push(item)
                await MentorReorgItem.create({ reorgId, memoryId: item.memoryId, origin: item.origin, action: item.action, target: item.target, centralId: item.centralId, text: item.text, mergeInto: item.mergeInto, mergeIntoResumo: item.mergeIntoResumo, reason: item.reason, note: item.note, routerConfidence: item.routerConfidence, routerReason: item.routerReason, sanitizerReason: item.sanitizerReason, moveBlocked: item.moveBlocked, ownerMemory: item.ownerMemory, status: "pending", error })
                done++
                await MentorReorg.updateOne({ _id: reorgId }, { $set: { done, costUsd: usage.costUsd, durationMs: Date.now() - startedAt } })
                await publishReorg(reorgId)
            }
        }
        const reconciled = reconcileReorgPlan(planned)
        for (const [index, item] of reconciled.entries()) {
            const before = planned[index]!
            if (before.action === item.action && before.target === item.target && before.centralId === item.centralId && before.text === item.text && before.mergeInto === item.mergeInto && before.note === item.note) continue
            await MentorReorgItem.updateOne({ reorgId, memoryId: item.memoryId }, { $set: { action: item.action, target: item.target, centralId: item.centralId, text: item.text, mergeInto: item.mergeInto, mergeIntoResumo: item.mergeIntoResumo, note: item.note, moveBlocked: item.moveBlocked } })
        }
        if (signal.aborted) throw abortError()
        await finish("ready")
        log.info({ reorgId, total, costUsd: usage.costUsd }, "[adversarial-agent] Plano de reorganização pronto")
    } catch (error) {
        if (signal.aborted || (error instanceof Error && error.name === "AbortError")) return finish("cancelled")
        const message = error instanceof Error ? error.message : String(error)
        log.warn({ err: error, reorgId }, "[adversarial-agent] Reorganização do Mentor falhou")
        return finish("failed", message)
    }
}

// ── Leitura e decisão ───────────────────────────────────────────────────────

function toItemDto(item: IMentorReorgItem, labels: Map<string, string>): MentorReorgItemDto {
    const key = reorgTargetValue(item.target, item.centralId)
    return {
        id: String(item._id),
        origin: item.origin,
        action: item.action,
        target: item.target,
        centralId: item.centralId,
        targetLabel: labels.get(key) ?? MENTOR_TARGET_LABELS[item.target].label,
        text: item.text,
        mergeInto: item.mergeInto,
        mergeIntoResumo: item.mergeIntoResumo,
        reason: item.reason,
        note: item.note,
        routerConfidence: item.routerConfidence,
        routerReason: item.routerReason,
        sanitizerReason: item.sanitizerReason,
        moveBlocked: item.moveBlocked,
        ownerMemory: item.ownerMemory,
        status: item.status,
        error: item.error,
    }
}

/** Nome de cada lista do plano (com o projeto, nas centrais). */
async function labelMap(scope: { targets: MentorTarget[]; centralIds: string[] }): Promise<Map<string, string>> {
    const centrals = await listCentralOptions().catch(() => [])
    const map = new Map<string, string>()
    for (const target of scope.targets) {
        if (target !== "developer-central") map.set(target, MENTOR_TARGET_LABELS[target].label)
        else for (const centralId of scope.centralIds) map.set(`developer-central:${centralId}`, listLabel("developer-central", centrals.find((central) => central.id === centralId)?.projectName ?? null))
    }
    return map
}

const countsOf = (items: { action: MentorReorgAction; status: string }[]) => {
    const counts = { keep: 0, rewrite: 0, move: 0, merge: 0, pending: 0, applied: 0, failed: 0, discarded: 0 }
    for (const item of items) {
        counts[item.action]++
        if (item.status === "pending") counts.pending++
        else if (item.status === "applied") counts.applied++
        else if (item.status === "failed") counts.failed++
        else if (item.status === "discarded") counts.discarded++
    }
    return counts
}

/** Plano completo (itens na ordem em que foram revisados). */
export async function getMentorReorg(id: string): Promise<MentorReorgDto> {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Reorganização não encontrada", "MENTOR_REORG_NOT_FOUND")
    await reorgDb()
    const run = (await MentorReorg.findById(id).lean()) as IMentorReorg | null
    if (!run) throw new DomainError(404, "Reorganização não encontrada", "MENTOR_REORG_NOT_FOUND")
    const items = (await MentorReorgItem.find({ reorgId: id }).sort({ createdAt: 1 }).lean()) as IMentorReorgItem[]
    const labels = await labelMap(run)
    return {
        id: String(run._id),
        status: run.status,
        targets: run.targets,
        centralIds: run.centralIds,
        total: run.total,
        done: run.done,
        costUsd: run.costUsd ?? 0,
        durationMs: run.durationMs,
        error: run.error,
        items: items.map((item) => toItemDto(item, labels)),
        counts: countsOf(items),
        createdAt: new Date(run.createdAt).toISOString(),
        finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
    }
}

/** Reorganizações mais recentes (histórico da seção), sem os itens. */
export async function listMentorReorgs(): Promise<MentorReorgListDto> {
    await reorgDb()
    const [rows, centrals] = await Promise.all([MentorReorg.find({}).sort({ createdAt: -1 }).limit(MENTOR_REORG_HISTORY_LIMIT).lean() as unknown as Promise<IMentorReorg[]>, listCentralOptions()])
    const items: MentorReorgSummaryDto[] = rows.map((run) => ({
        id: String(run._id),
        status: run.status,
        total: run.total,
        done: run.done,
        costUsd: run.costUsd ?? 0,
        durationMs: run.durationMs,
        createdAt: new Date(run.createdAt).toISOString(),
        finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
    }))
    return { items, centrals }
}

/** Reivindica a execução para aplicar/descartar (duas abas não decidem duas vezes). */
async function claimReorg(id: string): Promise<IMentorReorg> {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Reorganização não encontrada", "MENTOR_REORG_NOT_FOUND")
    await reorgDb()
    const run = (await MentorReorg.findById(id).lean()) as IMentorReorg | null
    if (!run) throw new DomainError(404, "Reorganização não encontrada", "MENTOR_REORG_NOT_FOUND")
    if (!MENTOR_REORG_DECIDABLE_STATUSES.includes(run.status)) throw new DomainError(409, "Esta reorganização não tem um plano aguardando decisão", "MENTOR_REORG_NOT_READY")
    const claimed = (await MentorReorg.findOneAndUpdate({ _id: id, status: run.status }, { $set: { status: "applying" } }).lean()) as IMentorReorg | null
    if (!claimed) throw new DomainError(409, "Esta reorganização não tem um plano aguardando decisão", "MENTOR_REORG_NOT_READY")
    return run
}

const memoryOptions = (run: IMentorReorg, auditContext: Record<string, unknown>): AgentMemoryWriteOptions => ({
    agent: { consumer: MENTOR_MEMORY_SOURCE, label: "Mentor · reorganização" },
    auditContext: { origem: "Reorganização do Mentor", reorganizacao: String(run._id), ...auditContext },
})

/** Aplica um item aprovado. `keep` não chama o Engramind. */
async function applyItem(run: IMentorReorg, item: IMentorReorgItem, override: { text?: string; confirmOwner?: boolean } | undefined, actorId: string): Promise<void> {
    const text = override?.text?.trim() || item.text
    const origin = { centralId: item.origin.centralId }
    const destination = { centralId: item.centralId }
    if (item.action === "keep") return
    if (item.action === "rewrite") {
        if (!text) throw new DomainError(400, "O item não tem texto para reescrever", "MENTOR_REORG_TEXT_MISSING")
        await updateAgentMemory(item.origin.target, item.memoryId, { texto: text, versao: item.origin.versao }, actorId, memoryOptions(run, { acao: "reescrever", memoria: item.memoryId }))
        return
    }
    if (item.action === "move") {
        const current = await getAgentMemory(item.origin.target, item.memoryId, origin)
        if (current.versao !== item.origin.versao) throw new DomainError(409, "A memória mudou desde o plano: gere outro plano.", "MEMORY_VERSION_CONFLICT")
        await moveAgentMemory(item.origin.target, item.memoryId, item.target, actorId, { from: origin, to: destination, ...memoryOptions(run, { acao: "mover", memoria: item.memoryId }) })
        if (text && text !== item.origin.texto) await updateAgentMemory(item.target, item.memoryId, { texto: text }, actorId, memoryOptions(run, { acao: "mover", memoria: item.memoryId }))
        return
    }
    // Fusão: a memória absorvida é arquivada (nunca excluída); a do dono exige confirmação explícita.
    if (!item.mergeInto) throw new DomainError(400, "A fusão não tem memória de destino", "MENTOR_REORG_MERGE_MISSING")
    if (item.origin.owner && !override?.confirmOwner) {
        throw new DomainError(400, `A memória "${item.origin.resumo}" foi escrita pelo dono: confirme explicitamente para arquivá-la depois da fusão.`, "MENTOR_OWNER_CONFIRM_REQUIRED", { itemId: String(item._id) })
    }
    if (!text) throw new DomainError(400, "O item não tem texto para fundir", "MENTOR_REORG_TEXT_MISSING")
    const target = await getAgentMemory(item.target, item.mergeInto, destination)
    await updateAgentMemory(item.target, item.mergeInto, { texto: text, versao: target.versao }, actorId, memoryOptions(run, { acao: "fundir", memoria: item.mergeInto, absorvida: item.memoryId }))
    const archive = { ativa: false, versao: item.origin.versao }
    if (item.origin.owner) {
        // Com a confirmação do dono, o arquivamento é gravado como ele (o token do agente não inativa memória do dono).
        await updateAgentMemory(item.origin.target, item.memoryId, archive, actorId, { centralId: item.origin.centralId, auditContext: { origem: "Reorganização do Mentor", reorganizacao: String(run._id), confirmadoPeloDono: true } })
    } else {
        await updateAgentMemory(item.origin.target, item.memoryId, archive, actorId, memoryOptions(run, { acao: "arquivar", memoria: item.memoryId, absorvidaPor: item.mergeInto }))
    }
}

/**
 * Aprova o plano (tudo ou os itens escolhidos), item a item e com reivindicação atômica. Uma falha
 * não derruba os demais; no fim, o status fica `applied` (tudo resolvido), `partial` (algo falhou ou
 * falta decidir) ou `discarded`.
 */
export async function applyMentorReorg(id: string, input: MentorReorgApplyInput, actorId: string): Promise<MentorReorgDto> {
    const run = await claimReorg(id)
    const all = (await MentorReorgItem.find({ reorgId: id }).sort({ createdAt: 1 }).lean()) as IMentorReorgItem[]
    const selected = input.itemIds?.length ? all.filter((item) => input.itemIds!.includes(String(item._id))) : all
    let applied = 0
    let failed = 0
    let needsOwner = 0
    for (const item of selected) {
        if (item.status !== "pending") continue
        const override = input.overrides?.[String(item._id)]
        // Aprovar em lote não arquiva memória do dono sem a confirmação explícita: o item fica pendente.
        if (item.action === "merge" && item.origin.owner && !override?.confirmOwner) {
            needsOwner++
            continue
        }
        const claimed = await MentorReorgItem.findOneAndUpdate({ _id: item._id, status: "pending" }, { $set: { status: "approved" } })
        if (!claimed) continue
        try {
            await applyItem(run, item, override, actorId)
            await MentorReorgItem.updateOne({ _id: item._id }, { $set: { status: "applied", error: null, ...(override?.text?.trim() ? { text: override.text.trim() } : {}) } })
            applied++
        } catch (error) {
            const message = error instanceof DomainError && error.code === "MEMORY_VERSION_CONFLICT" ? "A memória mudou desde o plano: gere outro plano de reorganização." : error instanceof Error ? error.message : String(error)
            log.warn({ err: error, reorgId: id, itemId: String(item._id) }, "[adversarial-agent] Item da reorganização falhou")
            await MentorReorgItem.updateOne({ _id: item._id }, { $set: { status: "failed", error: message } })
            failed++
        }
        await publishReorg(id)
    }
    const [pending, failedTotal] = await Promise.all([MentorReorgItem.countDocuments({ reorgId: id, status: "pending" }), MentorReorgItem.countDocuments({ reorgId: id, status: "failed" })])
    // Um item que falhou numa decisão anterior continua pesando no resultado.
    const status: MentorReorgStatus = pending > 0 || failedTotal > 0 ? "partial" : "applied"
    await MentorReorg.updateOne({ _id: id }, { $set: { status, error: null } })
    await recordAudit({ userId: actorId, entidade: MENTOR_REORG_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.APROVAR, depois: { status, aplicados: applied, falhas: failed, pendentes: pending, aguardandoConfirmacao: needsOwner } })
    await publishReorg(id)
    return getMentorReorg(id)
}

/** Descarta o plano (tudo ou os itens escolhidos): nada é gravado no Engramind. */
export async function discardMentorReorg(id: string, input: MentorReorgDiscardInput, actorId: string): Promise<MentorReorgDto> {
    const run = await claimReorg(id)
    const filter: Record<string, unknown> = input.itemIds?.length ? { reorgId: id, status: "pending", _id: { $in: input.itemIds } } : { reorgId: id, status: "pending" }
    await MentorReorgItem.updateMany(filter, { $set: { status: "discarded" } })
    // Um item já aplicado/falho continua como está; descartar não desfaz nada no Engramind.
    await MentorReorg.updateOne({ _id: id }, { $set: { status: "discarded" } })
    await recordAudit({ userId: actorId, entidade: MENTOR_REORG_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.DEVOLVER, depois: { status: "discarded", itens: input.itemIds?.length ?? "todos", execucao: String(run._id) } })
    await publishReorg(id)
    return getMentorReorg(id)
}
