import { isLoopFinished, streamText, type ModelMessage } from "ai"
import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { recordAiConsumption } from "@/lib/ai/consumption"
import { describeAiError, prepareModel, samplingOptions, type PreparedModel } from "@/lib/ai/stream"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { DEFAULT_OPEX_CLIENT_INSTRUCTIONS, OPEX_CLIENT_CONSUMPTION_ORIGIN, OPEX_CLIENT_JOBS_INSTRUCTION, OPEX_CONSUMPTION_ORIGIN, type OpexProviderId } from "../constants"
import { redactToolCalls, selectHistory, stripPastReasoning, withTurnContext } from "../history"
import { closeRunningTools, partsText } from "../live-message"
import type { OpexAgentSettings } from "../schemas"
import type { OpexTool, OpexToolContext } from "./tools/define"
import type { OpexMessageDto, OpexMessageStatus, OpexPart, OpexSessionStatus, OpexUsageDto } from "../types"
import { refreshConfirmations, requestConfirmation } from "./confirmations"
import { beginTurn, endTurn, enqueueFollowUp, isTurnActive, liveMessageOf, publishLine, takeFollowUp, abortTurn, type OpexFollowUp } from "./hub"
import { OpexMessage, OpexSession, type IOpexFileRef, type IOpexMessage } from "@/lib/db/models/Opex"
import { claimOpexFiles, fileMarkers, resolveFileMarkers } from "./files"
import { loadSession, loadSessionRaw, opexDb, publishSessionUpdated, toMessageDto } from "./sessions"
import { loadOpexSettings, opexAvailability } from "./settings"
import { refreshSessionTitle } from "./titler"
import { memoriesSection, memoryCacheNotice } from "@/features/ai/memories-prompt"
import { selfMemoryInstructions } from "@/features/ai/self-memory"
import type { MemoryTurn } from "@/features/ai/agents"
import type { McpTurnTools } from "./mcp/tools"
import { buildToolRuntime, redactToolInput, stringifyForDisplay } from "./tool-runtime"
import { assertClientOpexEnabled, assertClientToolAllowed, enabledClientToolNamesFor } from "./client-config"
import { clientActorFor } from "@/features/auth/server/context"
import { enabledClientOpexServerTools, findOpexClientServerTool } from "./client-tools/registry"
import { OWNER_SCOPE, actorIdOf, sessionScopeOf, type OpexServerScope } from "./scope"
import { nowContext } from "./tools/context"
import { enabledOpexTools, findOpexTool } from "./tools/registry"

const log = loggerFor({ module: "opex-agent" })
const INTERRUPTED = "Interrompido pelo usuário"

/**
 * Estável entre os turnos: o raciocínio assinado e o cache do provedor dependem do prompt de sistema.
 * No portal, a dica de jobs só entra com o grupo "Jobs agendados" ligado para o cliente.
 */
export function instructionsFor(settings: OpexAgentSettings, scope: OpexServerScope, memories = "", options: { jobs?: boolean; selfMemory?: boolean } = {}): string {
    const self = options.selfMemory ? selfMemoryInstructions("opex", memoryTurnOf(scope)) : ""
    if (scope.kind === "owner") {
        return [settings.instructions, "", `Dono do app: ${getLocalUser().name}. A data e a hora de cada turno vêm ao fim da mensagem do usuário.`, memoriesSection(memories), ...(self ? [self] : [])].join("\n")
    }
    const role = scope.actor.isAdmin ? "administrador do cliente" : "usuário do cliente"
    return [
        options.jobs ? `${DEFAULT_OPEX_CLIENT_INSTRUCTIONS}\n${OPEX_CLIENT_JOBS_INSTRUCTION}` : DEFAULT_OPEX_CLIENT_INSTRUCTIONS,
        "",
        `Cliente em escopo: ${scope.actor.client.name}. Usuário: ${scope.actor.displayName} (${role}).`,
        "A data e a hora de cada turno vêm ao fim da mensagem do usuário.",
        memoriesSection(memories),
        ...(self ? [self] : []),
    ].join("\n")
}

/** Turno das memórias: dono ou o cliente do portal. */
export function memoryTurnOf(scope: OpexServerScope): MemoryTurn {
    return scope.kind === "client" ? { kind: "client", clientId: String(scope.actor.client._id) } : { kind: "owner" }
}

/** Memórias do turno (contexto do Engramind) e as ferramentas "Memória própria" quando ligadas. */
async function memoriesForTurn(scope: OpexServerScope, sessionId: string, turnKey: string, actorId: string): Promise<{ block: string; notice: string | null; selfTools: OpexTool[] }> {
    const turn = memoryTurnOf(scope)
    const [{ agentMemoryContext }, { selfMemoryEnabled }] = await Promise.all([import("@/features/ai/server/agent-memory-context"), import("@/features/ai/server/self-memory/settings")])
    const context = await agentMemoryContext("opex", turn)
    let selfTools: OpexTool[] = []
    if (await selfMemoryEnabled("opex")) {
        const { selfMemoryTools } = await import("@/features/ai/server/self-memory/tools")
        const label = scope.kind === "client" ? `Agente Opex · ${scope.actor.client.name}` : "Agente Opex"
        selfTools = selfMemoryTools({ consumer: "opex", turn, label, turnKey, actorId, auditContext: { sessao: sessionId } })
    }
    return { block: context.block, notice: memoryCacheNotice(context), selfTools }
}

/** Ferramentas e política do turno, conforme o escopo. */
async function toolsForTurn(scope: OpexServerScope, settings: OpexAgentSettings): Promise<{ tools: OpexTool[]; overrides: Record<string, boolean> }> {
    if (scope.kind === "owner") return { tools: enabledOpexTools(settings.disabledTools), overrides: settings.confirmationOverrides }
    await assertClientOpexEnabled(scope.actor)
    const { names } = await enabledClientToolNamesFor(scope.actor)
    // Portal: catálogo próprio (nomes podem coincidir com os do dono), confirmação pelo padrão do risco.
    return { tools: enabledClientOpexServerTools(names, scope.actor.isAdmin), overrides: {} }
}

/** Ferramentas de MCP do turno (pelo nome no modelo). */
type TurnToolMap = ReadonlyMap<string, OpexTool>

function findTool(scope: OpexServerScope, name: string, extra?: TurnToolMap): OpexTool | undefined {
    return (scope.kind === "owner" ? findOpexTool(name) : findOpexClientServerTool(name)) ?? extra?.get(name)
}

function turnContext(notices: readonly string[] = []): string {
    const now = nowContext()
    return [`Contexto do turno: agora é ${now.local} (${now.timeZone}; ${now.iso}).`, ...notices].join(" ")
}

const redactInput = (scope: OpexServerScope, toolName: string, input: unknown, extra?: TurnToolMap) => redactToolInput(findTool(scope, toolName, extra), input)

const numberOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null)

/**
 * Reserva a sessão para um turno (atômico: um turno por sessão), grava a mensagem do usuário e
 * dispara o turno em segundo plano — fechar o chat não interrompe.
 */
async function startTurn(sessionId: string, followUp: OpexFollowUp, actorId: string, scope: OpexServerScope = OWNER_SCOPE): Promise<OpexMessageDto> {
    if (scope.kind === "client") await assertClientOpexEnabled(scope.actor)
    const settings = (await loadOpexSettings()).settings
    const availability = await opexAvailability(settings)
    if (!availability.available) throw new DomainError(409, availability.reason ?? "O Agente Opex não está disponível", "OPEX_UNAVAILABLE")
    await loadSession(sessionId, scope)
    const now = new Date()
    const claimed = await OpexSession.findOneAndUpdate(
        { _id: sessionId, status: { $ne: "running" } },
        { $set: { status: "running", lastError: null, lastMessageAt: now }, $inc: { nextSeq: 2, messageCount: 2 } },
        { new: false },
    ).lean()
    if (!claimed || isTurnActive(sessionId)) {
        if (claimed) await OpexSession.updateOne({ _id: sessionId }, { $inc: { nextSeq: -2, messageCount: -2 } })
        throw new DomainError(409, "O agente ainda está respondendo nesta sessão: aguarde ou pare a resposta", "OPEX_SESSION_BUSY")
    }
    const userId = new Types.ObjectId()
    let files: IOpexFileRef[]
    try {
        files = await claimOpexFiles(sessionId, userId, followUp.fileIds ?? [], settings.files)
    } catch (error) {
        await OpexSession.updateOne({ _id: sessionId }, { $set: { status: claimed.status, lastError: claimed.lastError }, $inc: { nextSeq: -2, messageCount: -2 } })
        throw error
    }
    const assistantId = new Types.ObjectId()
    const controller = new AbortController()
    beginTurn(sessionId, assistantId.toString(), controller)

    const text = followUp.display ?? followUp.text
    const content = files.length ? [...(followUp.text ? [{ type: "text", text: followUp.text }] : []), ...fileMarkers(files)] : followUp.text
    const userDoc = await OpexMessage.create({
        _id: userId,
        sessionId: new Types.ObjectId(sessionId),
        seq: claimed.nextSeq,
        role: "user",
        kind: followUp.kind,
        ...(followUp.job ? { job: followUp.job } : {}),
        text,
        files,
        parts: [],
        modelMessages: JSON.stringify([{ role: "user", content }]),
        status: "complete",
    })
    await publishSessionUpdated(sessionId)
    const userText = files.length ? `${text}${text ? "\n" : ""}(arquivos: ${files.map((file) => file.name).join(", ")})` : text
    void executeTurn({ sessionId, assistantId, seq: claimed.nextSeq + 1, controller, settings, actorId, scope, userText, jobId: followUp.job?.id ?? null })
    return toMessageDto(userDoc.toObject() as IOpexMessage & { _id: Types.ObjectId })
}

export async function sendMessage(sessionId: string, input: { text: string; fileIds?: string[] }, actorId: string, scope: OpexServerScope = OWNER_SCOPE): Promise<OpexMessageDto> {
    await opexDb()
    return startTurn(sessionId, { kind: "message", text: input.text, fileIds: input.fileIds ?? [] }, actorId, scope)
}

/** Mensagem do sistema (decisão de confirmação): roda já ou depois do turno atual. */
export async function queueFollowUp(sessionId: string, followUp: OpexFollowUp): Promise<void> {
    if (isTurnActive(sessionId)) {
        enqueueFollowUp(sessionId, followUp)
        return
    }
    const failJob = (reason: string) => (followUp.job ? settleJobTurn(followUp.job.id, { status: "error", error: reason, pendingConfirmation: false }) : Promise.resolve())
    // O escopo é reconstruído da sessão gravada (nunca do pedido): o dono continua dono e o usuário
    // do portal tem o vínculo e o papel revalidados antes do turno.
    const session = await loadSessionRaw(sessionId).catch(() => null)
    if (!session) {
        await failJob("A sessão escolhida para o job foi excluída")
        return
    }
    // Sessão do Agente Maddox (ex.: aviso de fim de deploy pedido por ele): o turno roda no OpenCode.
    if (session.agent === "maddox") {
        const { queueMaddoxFollowUp } = await import("@/features/maddox-agent/server/runner")
        await queueMaddoxFollowUp(sessionId, followUp)
        return
    }
    const scope = await sessionScopeOf(session).catch((error: unknown) => {
        log.warn({ sessionId, err: error instanceof Error ? error.message : error }, "[opex] escopo da sessão não resolve")
        void failJob(error instanceof Error ? error.message : String(error))
        return null
    })
    if (!scope) return
    await startTurn(sessionId, followUp, actorIdOf(scope), scope).catch((error: unknown) => {
        log.warn({ sessionId, err: error instanceof Error ? error.message : error }, "[opex] não foi possível continuar após a confirmação")
        void failJob(error instanceof Error ? error.message : String(error))
    })
}

/**
 * Prompt de um job agendado: roda já ou, com a sessão respondendo, entra na fila e roda quando o
 * turno atual terminar. Erros (agente indisponível, sessão inexistente) sobem para o job.
 */
export async function sendJobMessage(sessionId: string, followUp: OpexFollowUp & { job: { id: string; title: string } }, scope: OpexServerScope = OWNER_SCOPE): Promise<"started" | "queued"> {
    await opexDb()
    if (isTurnActive(sessionId)) {
        enqueueFollowUp(sessionId, followUp)
        return "queued"
    }
    try {
        await startTurn(sessionId, followUp, actorIdOf(scope), scope)
        return "started"
    } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "OPEX_SESSION_BUSY") throw error
        enqueueFollowUp(sessionId, followUp)
        return "queued"
    }
}

/** Fim do turno de um job: conclui o job (import tardio: o serviço de jobs depende deste runner). */
async function settleJobTurn(jobId: string, outcome: { status: "complete" | "interrupted" | "error"; error: string | null; pendingConfirmation: boolean }): Promise<void> {
    try {
        const { finishJobTurn } = await import("./jobs")
        await finishJobTurn(jobId, outcome)
    } catch (error) {
        log.error({ err: error, jobId }, "[opex] falha ao concluir o job")
    }
}

export async function interruptSession(sessionId: string, scope: OpexServerScope = OWNER_SCOPE): Promise<void> {
    await loadSession(sessionId, scope)
    if (!abortTurn(sessionId, INTERRUPTED)) {
        await OpexSession.updateOne({ _id: sessionId, status: "running" }, { $set: { status: "idle" } })
        await publishSessionUpdated(sessionId)
    }
}

interface TurnArgs {
    sessionId: string
    assistantId: Types.ObjectId
    seq: number
    controller: AbortController
    settings: OpexAgentSettings
    actorId: string
    scope: OpexServerScope
    userText: string
    /** Job agendado que disparou o turno. */
    jobId: string | null
}

async function loadHistory(sessionId: string, summary: string, provider: OpexProviderId, notices: readonly string[] = []): Promise<ModelMessage[]> {
    const stored = await OpexMessage.find({ sessionId: new Types.ObjectId(sessionId) }).sort({ seq: 1 }).select({ role: 1, modelMessages: 1 }).lean<Pick<IOpexMessage, "role" | "modelMessages">[]>()
    const turns = stored.map((item) => ({ role: item.role, modelMessages: parseModelMessages(item.modelMessages) }))
    // Os arquivos entram só nos turnos que couberam no orçamento, no formato que o provedor atual lê.
    const messages = await resolveFileMarkers(stripPastReasoning(selectHistory(turns, summary).messages), provider)
    // A data e a hora do turno vão só no envio, ao fim da mensagem do usuário, para o prompt de sistema não mudar.
    return withTurnContext(messages, turnContext(notices)) as ModelMessage[]
}

function parseModelMessages(json: string): unknown[] {
    try {
        const parsed: unknown = JSON.parse(json)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

async function executeTurn(args: TurnArgs): Promise<void> {
    const { sessionId, assistantId, controller, settings, scope } = args
    const startedAt = Date.now()
    const main = settings.main
    let prepared: PreparedModel | null = null
    let errorMessage: string | null = null
    let aborted = false
    let usage: OpexUsageDto | null = null
    let responseMessages: unknown[] | null = null
    const toolNames: string[] = []
    let mcp: McpTurnTools | null = null
    let lookup: TurnToolMap | undefined

    try {
        const session = await loadSession(sessionId, scope)
        const { tools: appTools, overrides: appOverrides } = await toolsForTurn(scope, settings)
        // MCPs habilitados (no portal, os liberados ao cliente): falha de um MCP vira aviso no contexto.
        mcp = await (await import("./mcp/tools")).loadMcpTools(scope, controller.signal)
        const mcpTools = new Map(mcp.tools.map((tool) => [tool.name, tool]))
        const memory = await memoriesForTurn(scope, sessionId, `opex:${sessionId}:${assistantId.toString()}`, args.actorId)
        const selfNames = new Set(memory.selfTools.map((tool) => tool.name))
        const appNames = new Set([...appTools.map((tool) => tool.name), ...selfNames])
        const tools = [...appTools, ...memory.selfTools, ...mcp.tools.filter((tool) => !appNames.has(tool.name))]
        if (memory.notice) publishLine(sessionId, { type: "text-delta", text: `> ${memory.notice}\n\n` })
        const overrides = { ...mcp.overrides, ...appOverrides }
        const history = await loadHistory(sessionId, session.summary, main.provider!, mcp.notices)
        // O escopo é mutável: a revalidação antes de cada ferramenta troca o ator pelo atual (papel
        // pode ter mudado no meio do turno). As ferramentas leem sempre `context.scope`.
        const toolContext: OpexToolContext = { sessionId, actorId: args.actorId, signal: controller.signal, scope }
        for (const tool of memory.selfTools) mcpTools.set(tool.name, tool)
        lookup = mcpTools
        const runtime = buildToolRuntime(tools, toolContext, overrides, {
            requestConfirmation: (tool, input, toolCallId) => requestConfirmation(sessionId, assistantId.toString(), tool, input, toolCallId),
            ...(scope.kind === "client"
                ? {
                      authorize: async (tool: OpexTool) => {
                          const current = toolContext.scope
                          if (!current || current.kind !== "client") return
                          // Memória própria: não é ferramenta do catálogo do portal; só revalida o acesso do usuário.
                          if (selfNames.has(tool.name)) {
                              const fresh = await clientActorFor(current.actor.userId, String(current.actor.client._id))
                              await assertClientOpexEnabled(fresh)
                              toolContext.scope = { kind: "client", actor: fresh }
                              return
                          }
                          const actor = await assertClientToolAllowed(tool.name, current.actor, tool.mcpServerId)
                          toolContext.scope = { kind: "client", actor }
                      },
                  }
                : {}),
        })
        prepared = await prepareModel({ provider: main.provider!, model: main.model!, variant: main.variant })
        const result = streamText({
            model: prepared.model,
            instructions: instructionsFor(settings, scope, memory.block, { jobs: tools.some((tool) => tool.group === "jobs"), selfMemory: memory.selfTools.length > 0 }),
            messages: history,
            tools: runtime.tools,
            stopWhen: isLoopFinished(),
            abortSignal: controller.signal,
            providerOptions: prepared.providerOptions,
            ...(prepared.reasoning ? { reasoning: prepared.reasoning } : {}),
            ...samplingOptions({ provider: main.provider!, variant: main.variant, temperature: main.temperature, maxOutputTokens: main.maxOutputTokens }),
        })
        for await (const part of result.fullStream) {
            switch (part.type) {
                case "text-delta":
                    if (part.text) publishLine(sessionId, { type: "text-delta", text: part.text })
                    break
                case "reasoning-delta":
                    publishLine(sessionId, { type: "reasoning-delta", text: part.text ?? "" })
                    break
                case "tool-input-start": {
                    const tool = findTool(scope, part.toolName, lookup)
                    publishLine(sessionId, { type: "tool-start", id: part.id, name: part.toolName, group: tool?.group ?? null, label: tool?.label ?? part.toolName })
                    break
                }
                case "tool-call": {
                    const tool = findTool(scope, part.toolName, lookup)
                    toolNames.push(tool?.label ?? part.toolName)
                    publishLine(sessionId, { type: "tool-start", id: part.toolCallId, name: part.toolName, group: tool?.group ?? null, label: tool?.label ?? part.toolName })
                    publishLine(sessionId, { type: "tool-input", id: part.toolCallId, input: stringifyForDisplay(redactInput(scope, part.toolName, part.input, lookup)) })
                    break
                }
                case "tool-result": {
                    const confirmation = runtime.confirmations.get(part.toolCallId) ?? null
                    publishLine(sessionId, {
                        type: "tool-end",
                        id: part.toolCallId,
                        state: "done",
                        output: confirmation ? null : stringifyForDisplay(part.output),
                        error: null,
                        confirmation,
                        durationMs: runtime.durations.get(part.toolCallId) ?? null,
                    })
                    break
                }
                case "tool-error":
                    publishLine(sessionId, {
                        type: "tool-end",
                        id: part.toolCallId,
                        state: "error",
                        output: null,
                        error: part.error instanceof Error ? part.error.message : String(part.error),
                        confirmation: null,
                        durationMs: runtime.durations.get(part.toolCallId) ?? null,
                    })
                    break
                case "error":
                    errorMessage = describeAiError(part.error)
                    break
                case "abort":
                    aborted = true
                    break
                case "finish":
                    usage = { inputTokens: numberOrNull(part.totalUsage.inputTokens), outputTokens: numberOrNull(part.totalUsage.outputTokens), totalTokens: numberOrNull(part.totalUsage.totalTokens) }
                    if (part.finishReason === "error" && !errorMessage) errorMessage = "O modelo terminou com erro"
                    break
            }
        }
        if (!aborted && !errorMessage) responseMessages = redactToolCalls(await result.responseMessages, (name, input) => redactInput(scope, name, input, lookup))
    } catch (error) {
        if (controller.signal.aborted) aborted = true
        else {
            errorMessage = describeAiError(error)
            log.warn({ sessionId, provider: main.provider, model: main.model, err: errorMessage }, "[opex] falha no turno")
        }
    } finally {
        await prepared?.dispose().catch(() => undefined)
        await mcp?.close().catch(() => undefined)
    }

    await finishTurn(args, { startedAt, errorMessage, aborted, usage, responseMessages, toolNames })
}

interface TurnOutcome {
    startedAt: number
    errorMessage: string | null
    aborted: boolean
    usage: OpexUsageDto | null
    responseMessages: unknown[] | null
    toolNames: string[]
}

async function finishTurn(args: TurnArgs, outcome: TurnOutcome): Promise<void> {
    const { sessionId, assistantId, controller, settings, scope } = args
    const status: OpexMessageStatus = outcome.aborted ? "interrupted" : outcome.errorMessage ? "error" : "complete"
    const error = outcome.aborted ? INTERRUPTED : outcome.errorMessage
    let parts: OpexPart[] = liveMessageOf(sessionId)?.parts ?? []
    if (status !== "complete") parts = closeRunningTools(parts, error ?? "Turno encerrado")
    const text = partsText(parts)
    let pendingConfirmation = false
    try {
        parts = await refreshConfirmations(parts)
        const fallback = [
            text || "(sem resposta)",
            outcome.toolNames.length ? `\n\n[Ferramentas chamadas neste turno: ${outcome.toolNames.join(", ")}]` : "",
            status === "interrupted" ? "\n\n[Resposta interrompida pelo usuário.]" : status === "error" ? `\n\n[A resposta falhou: ${error}]` : "",
        ].join("")
        await OpexMessage.create({
            _id: assistantId,
            sessionId: new Types.ObjectId(sessionId),
            seq: args.seq,
            role: "assistant",
            kind: "message",
            text,
            parts,
            modelMessages: JSON.stringify(outcome.responseMessages ?? [{ role: "assistant", content: fallback }]),
            status,
            error,
            usage: outcome.usage,
            durationMs: Date.now() - outcome.startedAt,
            model: settings.main.model ? `${settings.main.provider}/${settings.main.model}` : null,
        })
        const pending = parts.some((part) => part.type === "tool" && part.confirmation?.status === "pending")
        pendingConfirmation = pending
        const sessionStatus: OpexSessionStatus = status === "error" ? "error" : pending ? "awaiting_confirmation" : "idle"
        await OpexSession.updateOne({ _id: sessionId }, { $set: { status: sessionStatus, lastError: status === "error" ? error : null, lastMessageAt: new Date() } })
    } catch (persistError) {
        log.error({ err: persistError, sessionId }, "[opex] falha ao gravar o turno")
        await OpexSession.updateOne({ _id: sessionId }, { $set: { status: "error", lastError: "Não foi possível gravar a resposta" } }).catch(() => undefined)
    }
    endTurn(sessionId, controller, { type: "turn-end", messageId: assistantId.toString(), status, error })
    await publishSessionUpdated(sessionId)
    if (args.jobId) await settleJobTurn(args.jobId, { status, error, pendingConfirmation })

    if (outcome.usage && settings.main.provider && settings.main.model) {
        await recordAiConsumption({
            dedupKey: `opex:${assistantId.toString()}`,
            provider: settings.main.provider,
            origin: scope.kind === "client" ? OPEX_CLIENT_CONSUMPTION_ORIGIN : OPEX_CONSUMPTION_ORIGIN,
            subject: sessionId,
            model: settings.main.model,
            ...outcome.usage,
            costUsd: null,
        })
    }
    if (status !== "interrupted" || text) {
        await refreshSessionTitle(sessionId, settings, { userText: args.userText, assistantText: text, tools: outcome.toolNames }, scope).catch((titleError: unknown) =>
            log.warn({ err: titleError, sessionId }, "[opex] falha no subagente de título"),
        )
    }
    const next = takeFollowUp(sessionId)
    if (next) await queueFollowUp(sessionId, next)
}
