import { Types } from "mongoose"
import { clientActorFor } from "@/features/auth/server/context"
import { maddoxMemoryAgentsFor } from "@/features/ai/agents"
import { agentMemoryTexts, memoriesSection } from "@/features/ai/server/agent-memory-service"
import { findOpexClientTool } from "@/features/opex-agent/client-tools"
import { OPEX_FILE_CONTENT_MAX_BYTES } from "@/features/opex-agent/constants"
import { closePendingRequests, closeRunningTools, partsText } from "@/features/opex-agent/live-message"
import { beginTurn, endTurn, enqueueFollowUp, isTurnActive, liveMessageOf, publishLine, takeFollowUp, abortTurn, type OpexFollowUp } from "@/features/opex-agent/server/hub"
import { claimOpexFiles, readOpexFileBytes, type OpexFileDoc } from "@/features/opex-agent/server/files"
import { OWNER_SCOPE, sessionScopeOf, withAgent, type OpexServerScope } from "@/features/opex-agent/server/scope"
import { loadSession, loadSessionRaw, opexDb, publishSessionUpdated, toMessageDto } from "@/features/opex-agent/server/sessions"
import { refreshSessionTitleWith } from "@/features/opex-agent/server/titler"
import { stringifyForDisplay } from "@/features/opex-agent/server/tool-runtime"
import type { OpexConfirmationDto, OpexMessageDto, OpexMessageStatus, OpexPart, OpexSessionStatus, OpexToolPartGroup, OpexUsageDto } from "@/features/opex-agent/types"
import { listAiModels } from "@/lib/ai/catalog"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import type { OpencodeFormDto, OpencodePermissionDto } from "@/lib/ai/opencode-events"
import { runAgentTurn, type TurnEvent } from "@/lib/ai/opencode-run"
import { DomainError } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { OpexFile, OpexMessage, OpexSession, type IOpexFileRef, type IOpexMessage } from "@/lib/db/models/Opex"
import { parseMaddoxMcpToolName } from "../catalog"
import {
    DEFAULT_MADDOX_CLIENT_INSTRUCTIONS,
    MADDOX_CLIENT_CONSUMPTION_ORIGIN,
    MADDOX_CLIENT_TITLE_CONSUMPTION_ORIGIN,
    MADDOX_CONSUMPTION_ORIGIN,
    MADDOX_NATIVE_TOOL_GROUP,
    MADDOX_TITLE_CONSUMPTION_ORIGIN,
    MADDOX_TURN_TIMEOUT_MS,
} from "../constants"
import type { MaddoxAgentSettings } from "../schemas"
import { assertClientMaddoxEnabled } from "./client-config"
import { setPendingRequest } from "./requests"
import { applySessionSetup, createOpencodeSession, ensureMaddoxMcp, maddoxDirectory, opencodeSessionExists } from "./opencode-session"
import { maddoxPermissionsFor } from "./scope-tools"
import { loadMaddoxSettings, maddoxAvailability } from "./settings"

/**
 * Turnos do **Agente Maddox** (SOMENTE servidor): a conversa roda numa sessão do OpenCode
 * (`runAgentTurn`), no diretório padrão da integração OpenCode. O Opex guarda as mensagens e a resposta
 * exibida (mesmo formato do Agente Opex) e repassa cada evento ao chat pelo mesmo barramento NDJSON.
 * As ferramentas nativas do OpenCode seguem as permissões do OpenCode; as do Opex chegam pelo servidor
 * MCP do Opex (`/api/maddox/mcp/*`), que revalida o escopo a cada chamada.
 */

const log = loggerFor({ module: "maddox-agent" })
const INTERRUPTED = "Interrompido pelo usuário"
/** Revalidação do usuário do portal durante o turno (vínculo, papel e Maddox ligado). */
const CLIENT_RECHECK_MS = 30_000

type SessionDoc = Awaited<ReturnType<typeof loadSession>>

const maddoxScope = (scope: OpexServerScope): OpexServerScope => withAgent(scope, "maddox")

/** Instruções da sessão: as configuradas (dono) ou as fixas do portal + escopo + memórias. */
export function maddoxInstructionsFor(settings: MaddoxAgentSettings, scope: OpexServerScope, memories: readonly string[] = [], notices: readonly string[] = []): string {
    const head =
        scope.kind === "owner"
            ? [settings.instructions, "", `Dono do app: ${getLocalUser().name}.`]
            : [
                  DEFAULT_MADDOX_CLIENT_INSTRUCTIONS,
                  "",
                  `Cliente em escopo: ${scope.actor.client.name}. Usuário: ${scope.actor.displayName} (${scope.actor.isAdmin ? "administrador do cliente" : "usuário do cliente"}).`,
              ]
    return [...head, ...notices, memoriesSection(memories)].join("\n")
}

/** Modelo do turno: o da sessão (se ainda estiver no catálogo) ou o padrão da configuração. */
export function resolveTurnModel(
    settings: Pick<MaddoxAgentSettings, "main">,
    override: { model: string; variant: string | null } | null | undefined,
    catalog: readonly { id: string; variants: string[] }[] | null,
): { model: string | null; variant: string | null; fellBack: boolean } {
    if (override?.model) {
        const found = catalog ? catalog.find((item) => item.id === override.model) : { id: override.model, variants: override.variant ? [override.variant] : [] }
        if (found) return { model: override.model, variant: override.variant && found.variants.includes(override.variant) ? override.variant : null, fellBack: false }
        return { model: settings.main.model, variant: settings.main.variant, fellBack: true }
    }
    return { model: settings.main.model, variant: settings.main.variant, fellBack: false }
}

type ToolCard = { group: OpexToolPartGroup | null; label: string }

/**
 * Cards das ferramentas: as do Opex com o rótulo e o grupo do catálogo; as nativas do OpenCode com o
 * próprio nome. Carregado antes do turno para a tradução dos eventos ser síncrona (a ordem das linhas
 * do chat segue a dos eventos).
 */
export async function toolCardResolver(): Promise<(name: string) => ToolCard> {
    const { findOpexTool } = await import("@/features/opex-agent/server/tools/registry")
    return (name) => {
        const parsed = parseMaddoxMcpToolName(name)
        if (!parsed) return { group: MADDOX_NATIVE_TOOL_GROUP, label: name }
        if (parsed.scope === "portal") {
            const meta = findOpexClientTool(parsed.tool)
            return { group: meta?.group ?? null, label: meta?.label ?? parsed.tool }
        }
        const tool = findOpexTool(parsed.tool)
        return { group: tool?.group ?? null, label: tool?.label ?? parsed.tool }
    }
}

async function startTurn(sessionId: string, followUp: OpexFollowUp, scope: OpexServerScope): Promise<OpexMessageDto> {
    if (scope.kind === "client") await assertClientMaddoxEnabled(scope.actor)
    const settings = (await loadMaddoxSettings()).settings
    const availability = await maddoxAvailability(settings)
    if (!availability.available) throw new DomainError(409, availability.reason ?? "O Agente Maddox não está disponível", "MADDOX_UNAVAILABLE")
    await loadSession(sessionId, scope)
    const now = new Date()
    const claimed = await OpexSession.findOneAndUpdate(
        { _id: sessionId, agent: "maddox", status: { $nin: ["running", "awaiting_confirmation"] } },
        { $set: { status: "running", lastError: null, lastMessageAt: now, pendingRequests: [] }, $inc: { nextSeq: 2, messageCount: 2 } },
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
    const userDoc = await OpexMessage.create({
        _id: userId,
        sessionId: new Types.ObjectId(sessionId),
        seq: claimed.nextSeq,
        role: "user",
        kind: followUp.kind,
        text,
        files,
        parts: [],
        modelMessages: "[]",
        status: "complete",
    })
    await publishSessionUpdated(sessionId)
    void executeTurn({ sessionId, assistantId, seq: claimed.nextSeq + 1, controller, settings, scope, text: followUp.text, displayText: text, files })
    return toMessageDto(userDoc.toObject() as IOpexMessage & { _id: Types.ObjectId })
}

export async function sendMaddoxMessage(sessionId: string, input: { text: string; fileIds?: string[] }, actorId: string, scope: OpexServerScope = OWNER_SCOPE): Promise<OpexMessageDto> {
    await opexDb()
    void actorId
    return startTurn(sessionId, { kind: "message", text: input.text, fileIds: input.fileIds ?? [] }, maddoxScope(scope))
}

/**
 * Mensagem do sistema numa sessão do Maddox (ex.: aviso do fim de um deploy pedido por ele): roda já
 * ou depois do turno atual. O escopo é reconstruído da sessão gravada, nunca do pedido.
 */
export async function queueMaddoxFollowUp(sessionId: string, followUp: OpexFollowUp): Promise<void> {
    if (isTurnActive(sessionId)) {
        enqueueFollowUp(sessionId, followUp)
        return
    }
    const session = await loadSessionRaw(sessionId).catch(() => null)
    if (!session) {
        log.info({ sessionId, kind: followUp.kind }, "[maddox] aviso descartado: a sessão não existe mais")
        return
    }
    const scope = await sessionScopeOf(session).catch((error: unknown) => {
        log.warn({ sessionId, err: error instanceof Error ? error.message : error }, "[maddox] escopo da sessão não resolve: aviso descartado")
        return null
    })
    if (!scope) return
    await startTurn(sessionId, followUp, maddoxScope(scope)).catch((error: unknown) =>
        log.warn({ sessionId, err: error instanceof Error ? error.message : error }, "[maddox] não foi possível continuar a sessão"),
    )
}

export async function interruptMaddoxSession(sessionId: string, scope: OpexServerScope = OWNER_SCOPE): Promise<void> {
    await loadSession(sessionId, maddoxScope(scope))
    if (!abortTurn(sessionId, INTERRUPTED)) {
        await OpexSession.updateOne({ _id: sessionId, status: { $in: ["running", "awaiting_confirmation"] } }, { $set: { status: "idle", pendingRequests: [] } })
        await publishSessionUpdated(sessionId)
    }
}

interface TurnArgs {
    sessionId: string
    assistantId: Types.ObjectId
    seq: number
    controller: AbortController
    settings: MaddoxAgentSettings
    scope: OpexServerScope
    /** Texto enviado ao modelo. */
    text: string
    /** Texto exibido no chat (título e resumo usam este). */
    displayText: string
    files: IOpexFileRef[]
}

/** Arquivos da mensagem: conteúdo como `data:` URI até o teto; acima disso, só a referência no texto. */
async function turnFiles(files: readonly IOpexFileRef[]): Promise<{ uris: { uri: string; name: string }[]; references: string[] }> {
    if (!files.length) return { uris: [], references: [] }
    const docs = await OpexFile.find({ _id: { $in: files.map((file) => file.id) } }).lean<OpexFileDoc[]>()
    const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]))
    const uris: { uri: string; name: string }[] = []
    const references: string[] = []
    for (const file of files) {
        const doc = byId.get(file.id)
        let delivered = false
        if (doc && file.size <= OPEX_FILE_CONTENT_MAX_BYTES) {
            try {
                const bytes = await readOpexFileBytes(doc)
                uris.push({ uri: `data:${file.mediaType || "application/octet-stream"};base64,${Buffer.from(bytes).toString("base64")}`, name: file.name })
                delivered = true
            } catch (error) {
                log.warn({ fileId: file.id, err: error instanceof Error ? error.message : error }, "[maddox] arquivo não baixado do storage: vai só a referência")
            }
        }
        references.push(`- ${file.name} (fileId ${file.id}, ${file.mediaType}, ${file.size} bytes)${delivered ? "" : " — só referência (grande demais ou indisponível)"}`)
    }
    return { uris, references }
}

/** Sessão do OpenCode da conversa (cria na primeira vez ou se foi removida no host). */
async function opencodeSessionFor(client: OpencodeClient, session: SessionDoc, directory: string | undefined, permissions: Parameters<typeof applySessionSetup>[2]["permissions"]): Promise<string> {
    if (session.opencodeSessionId && (await opencodeSessionExists(client, session.opencodeSessionId))) return session.opencodeSessionId
    const id = await createOpencodeSession(client, { directory, title: session.title, sessionId: session._id.toString(), permissions })
    await OpexSession.updateOne({ _id: session._id }, { $set: { opencodeSessionId: id } })
    return id
}

function confirmationOf(permission: OpencodePermissionDto): OpexConfirmationDto {
    const resources = permission.resources.filter((item) => item && item !== "*")
    const summary = permission.message ?? `Permitir "${permission.action}"${resources.length ? ` em ${resources.slice(0, 3).join(", ")}` : ""}?`
    return { actionId: permission.id, summary, status: "pending", error: null }
}

async function executeTurn(args: TurnArgs): Promise<void> {
    const { sessionId, controller, settings, scope } = args
    const startedAt = Date.now()
    let usage: OpexUsageDto = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    let status: OpexMessageStatus = "complete"
    let error: string | null = null
    let model: string | null = settings.main.model
    let variant: string | null = settings.main.variant
    const toolNames: string[] = []
    const toolStarts = new Map<string, number>()
    let recheck: ReturnType<typeof setInterval> | null = null

    try {
        const session = await loadSession(sessionId, scope)
        const client = await getOpencodeClient()
        const directory = await maddoxDirectory()
        const catalog = await listAiModels("opencode").catch(() => null)
        const resolved = resolveTurnModel(settings, session.modelOverride, catalog)
        model = resolved.model
        variant = resolved.variant
        if (resolved.fellBack) {
            await OpexSession.updateOne({ _id: sessionId }, { $set: { modelOverride: null } })
            publishLine(sessionId, { type: "text-delta", text: `> O modelo ${session.modelOverride?.model} saiu do catálogo do OpenCode: esta sessão voltou ao modelo padrão (${model}).\n\n` })
        }
        if (!model) throw new DomainError(409, "Selecione o modelo do Agente Maddox", "MADDOX_UNAVAILABLE")
        const notices: string[] = []
        const mcp = await ensureMaddoxMcp(client, directory, settings.mcpBaseUrl)
        if (!mcp.ok) notices.push(`Aviso: as ferramentas do Opex (MCP) estão indisponíveis neste turno (${mcp.error}).`)
        const permissions = await maddoxPermissionsFor(scope, settings)
        const ocSessionId = await opencodeSessionFor(client, session, directory, permissions)
        const memories = await agentMemoryTexts(maddoxMemoryAgentsFor(scope.kind))
        await applySessionSetup(client, ocSessionId, { permissions, instructions: maddoxInstructionsFor(settings, scope, memories, notices) })
        const { uris, references } = await turnFiles(args.files)
        const prompt = references.length ? `${args.text}${args.text ? "\n\n" : ""}Arquivos enviados nesta mensagem:\n${references.join("\n")}` : args.text

        // Portal: revalida o ator durante o turno; perdeu o acesso → interrompe (as ferramentas nativas também param).
        if (scope.kind === "client") {
            recheck = setInterval(() => {
                void clientActorFor(scope.actor.userId, String(scope.actor.client._id))
                    .then((actor) => assertClientMaddoxEnabled(actor))
                    .catch((reason: unknown) => {
                        const message = reason instanceof Error ? reason.message : String(reason)
                        log.info({ sessionId, err: message }, "[maddox] acesso do usuário do portal revogado: turno interrompido")
                        controller.abort(new Error(message))
                    })
            }, CLIENT_RECHECK_MS)
            recheck.unref?.()
        }

        const toolCardOf = await toolCardResolver()
        const publish = (event: TurnEvent) => {
            switch (event.type) {
                case "text":
                    publishLine(sessionId, { type: "text-delta", text: event.text })
                    break
                case "reasoning":
                    publishLine(sessionId, { type: "reasoning-delta", text: event.text ?? "" })
                    break
                case "tool":
                    onTool(event)
                    break
                case "notice":
                    log.info({ sessionId, level: event.level, message: event.message }, "[maddox] aviso do OpenCode")
                    break
                default:
                    break
            }
        }
        const onTool = (event: Extract<TurnEvent, { type: "tool" }>) => {
            const live = liveMessageOf(sessionId)
            const exists = live?.parts.some((part) => part.type === "tool" && part.id === event.id)
            if (!exists) {
                const card = toolCardOf(event.name)
                toolNames.push(card.label)
                toolStarts.set(event.id, Date.now())
                publishLine(sessionId, { type: "tool-start", id: event.id, name: event.name, group: card.group, label: card.label })
            }
            if (event.input !== undefined) publishLine(sessionId, { type: "tool-input", id: event.id, input: event.input ?? null })
            if (event.state !== "running") {
                const started = toolStarts.get(event.id)
                publishLine(sessionId, {
                    type: "tool-end",
                    id: event.id,
                    state: event.state === "done" ? "done" : "error",
                    output: stringifyForDisplay(event.output ?? null),
                    error: event.error ?? null,
                    confirmation: null,
                    durationMs: started ? Date.now() - started : null,
                })
            }
        }
        const onPermission = async (permission: OpencodePermissionDto) => {
            const live = liveMessageOf(sessionId)
            let partId = permission.toolCallId && live?.parts.some((part) => part.type === "tool" && part.id === permission.toolCallId) ? permission.toolCallId : null
            if (!partId) {
                // Sem a chamada correspondente: card próprio do pedido de permissão.
                partId = `permission:${permission.id}`
                const card = toolCardOf(permission.action)
                publishLine(sessionId, { type: "tool-start", id: partId, name: permission.action, group: card.group, label: `Permissão · ${card.label}` })
                publishLine(sessionId, { type: "tool-input", id: partId, input: permission.resources.length ? permission.resources.join("\n") : null })
            }
            publishLine(sessionId, { type: "tool-confirmation", id: partId, confirmation: confirmationOf(permission) })
            await setPendingRequest(sessionId, { id: permission.id, kind: "permission", partId, createdAt: new Date() })
        }
        const onPermissionClosed = async (id: string) => {
            // Respondida fora do chat (ou já registrada pela rota): só fecha o card se ainda estiver pendente.
            const part = liveMessageOf(sessionId)?.parts.find((item) => item.type === "tool" && item.confirmation?.actionId === id)
            if (part?.type === "tool" && part.confirmation?.status === "pending") publishLine(sessionId, { type: "tool-confirmation", id: part.id, confirmation: { ...part.confirmation, status: "confirmed" } })
            await setPendingRequest(sessionId, null, id)
        }
        const onForm = async (form: OpencodeFormDto) => {
            publishLine(sessionId, { type: "form", form })
            await setPendingRequest(sessionId, { id: form.id, kind: "form", partId: form.id, createdAt: new Date() })
        }
        const onFormClosed = async (id: string) => {
            const part = liveMessageOf(sessionId)?.parts.find((item) => item.type === "form" && item.id === id)
            if (part?.type === "form" && part.status === "pending") publishLine(sessionId, { type: "form-status", id, status: "answered" })
            await setPendingRequest(sessionId, null, id)
        }

        const result = await runAgentTurn(
            client,
            {
                id: `maddox:${sessionId}`,
                sessionId: ocSessionId,
                stage: "Maddox",
                title: session.title,
                agent: { agent: null, model, variant },
                text: prompt,
                timeoutMs: MADDOX_TURN_TIMEOUT_MS,
                signal: controller.signal,
                consumption: { origin: scope.kind === "client" ? MADDOX_CLIENT_CONSUMPTION_ORIGIN : MADDOX_CONSUMPTION_ORIGIN, subject: sessionId },
                files: uris,
            },
            {
                publish,
                onPermission,
                onPermissionClosed,
                onForm,
                onFormClosed,
                onStep: ({ tokens }) => {
                    usage = {
                        inputTokens: (usage.inputTokens ?? 0) + tokens.input,
                        outputTokens: (usage.outputTokens ?? 0) + tokens.output,
                        totalTokens: (usage.totalTokens ?? 0) + tokens.input + tokens.output + tokens.reasoning,
                    }
                },
            },
        )
        status = result.outcome === "succeeded" ? "complete" : result.outcome === "interrupted" ? "interrupted" : "error"
        error = result.outcome === "succeeded" ? null : (result.message ?? (status === "interrupted" ? INTERRUPTED : "O agente terminou com erro"))
        if (status === "interrupted" && controller.signal.aborted && controller.signal.reason instanceof Error) error = controller.signal.reason.message
    } catch (failure) {
        if (controller.signal.aborted) {
            status = "interrupted"
            error = controller.signal.reason instanceof Error ? controller.signal.reason.message : INTERRUPTED
        } else {
            status = "error"
            error = failure instanceof Error ? failure.message : String(failure)
            log.warn({ sessionId, model, err: error }, "[maddox] falha no turno")
        }
    } finally {
        if (recheck) clearInterval(recheck)
    }

    await finishTurn(args, { startedAt, status, error, usage, model, variant, toolNames })
}

interface TurnOutcome {
    startedAt: number
    status: OpexMessageStatus
    error: string | null
    usage: OpexUsageDto
    model: string | null
    variant: string | null
    toolNames: string[]
}

async function finishTurn(args: TurnArgs, outcome: TurnOutcome): Promise<void> {
    const { sessionId, assistantId, controller, settings, scope } = args
    const { status, error } = outcome
    let parts: OpexPart[] = closePendingRequests(liveMessageOf(sessionId)?.parts ?? [])
    if (status !== "complete") parts = closeRunningTools(parts, error ?? "Turno encerrado")
    const text = partsText(parts)
    const usage = outcome.usage.totalTokens ? outcome.usage : null
    try {
        await OpexMessage.create({
            _id: assistantId,
            sessionId: new Types.ObjectId(sessionId),
            seq: args.seq,
            role: "assistant",
            kind: "message",
            text,
            parts,
            modelMessages: "[]",
            status,
            error,
            usage,
            durationMs: Date.now() - outcome.startedAt,
            model: outcome.model ? `${outcome.model}${outcome.variant ? ` (${outcome.variant})` : ""}` : null,
        })
        const sessionStatus: OpexSessionStatus = status === "error" ? "error" : "idle"
        await OpexSession.updateOne({ _id: sessionId }, { $set: { status: sessionStatus, lastError: status === "error" ? error : null, lastMessageAt: new Date(), pendingRequests: [] } })
    } catch (persistError) {
        log.error({ err: persistError, sessionId }, "[maddox] falha ao gravar o turno")
        await OpexSession.updateOne({ _id: sessionId }, { $set: { status: "error", lastError: "Não foi possível gravar a resposta", pendingRequests: [] } }).catch(() => undefined)
    }
    endTurn(sessionId, controller, { type: "turn-end", messageId: assistantId.toString(), status, error })
    await publishSessionUpdated(sessionId)

    // Título e resumo: decide pelo conteúdo produzido (inclusive em turnos iniciados por aviso/retomada).
    if (status !== "interrupted" || text) {
        const title = settings.title.model ? settings.title : settings.main
        await refreshSessionTitleWith(
            sessionId,
            {
                provider: "opencode",
                model: title.model,
                variant: title.variant,
                instructions: settings.titleInstructions,
                origin: scope.kind === "client" ? MADDOX_CLIENT_TITLE_CONSUMPTION_ORIGIN : MADDOX_TITLE_CONSUMPTION_ORIGIN,
            },
            { userText: args.displayText, assistantText: text, tools: outcome.toolNames },
        ).catch((titleError: unknown) => log.warn({ err: titleError, sessionId }, "[maddox] falha no subagente de título"))
    } else {
        log.info({ sessionId }, "[maddox] título não atualizado: turno interrompido sem resposta")
    }
    const next = takeFollowUp(sessionId)
    if (next) await queueMaddoxFollowUp(sessionId, next)
}
