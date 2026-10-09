import type { OpencodeClient } from "@/lib/ai/opencode-client"
import { describeToolInput, normalizeOpencodeEvent, toOpencodeModelRef, type OpencodeFormDto, type OpencodePermissionDto, type OpencodeTokenUsage } from "@/lib/ai/opencode-events"
import type { WorkbenchStage } from "../constants"
import type { AgentConfig } from "../schemas"
import { publishWorkbenchEvent } from "./hub"

/**
 * Um turno do agente numa sessão do OpenCode: troca agente/modelo, envia a mensagem e acompanha
 * os eventos até a execução terminar, repassando tudo para a mesa (`publishWorkbenchEvent`).
 * Não grava estado da mesa — quem chama (`workflow.ts`) decide a próxima etapa pelo resultado.
 */

export interface TurnRequest {
    workbenchId: string
    sessionId: string
    stage: WorkbenchStage
    title: string
    agent: AgentConfig
    text: string
    timeoutMs: number
    /** Abortado = interromper (botão Parar, exclusão da mesa, desligamento). */
    signal: AbortSignal
}

export interface TurnHooks {
    onPermission?: (permission: OpencodePermissionDto) => void | Promise<void>
    onPermissionClosed?: (id: string) => void | Promise<void>
    onForm?: (form: OpencodeFormDto) => void | Promise<void>
    onFormClosed?: (id: string) => void | Promise<void>
    onStep?: (usage: { costUsd: number; tokens: OpencodeTokenUsage }) => void | Promise<void>
    onMoved?: (directory: string) => void | Promise<void>
    heartbeat?: () => void | Promise<void>
}

export interface TurnResult {
    outcome: "succeeded" | "failed" | "interrupted"
    /** Texto do agente neste turno (o plano, o resumo, o bloco JSON final…). */
    text: string
    message: string | null
    costUsd: number
    durationMs: number
}

const HEARTBEAT_MS = 30_000
const RECONNECT_DELAY_MS = 2_000
const MAX_RECONNECTS = 30
const READY_TIMEOUT_MS = 3_000
const INTERRUPT_GRACE_MS = 15_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

type End = { outcome: TurnResult["outcome"]; message: string | null }

export async function runAgentTurn(client: OpencodeClient, request: TurnRequest, hooks: TurnHooks = {}): Promise<TurnResult> {
    const { workbenchId, sessionId } = request
    const startedAt = Date.now()
    const publish = (payload: Parameters<typeof publishWorkbenchEvent>[1]) => publishWorkbenchEvent(workbenchId, payload)
    publish({ type: "turn", stage: request.stage, title: request.title, agent: request.agent.agent, model: request.agent.model })

    let text = ""
    let costUsd = 0
    const toolNames = new Map<string, string>()
    const toolInputs = new Map<string, string | null>()

    // Agente e modelo da etapa (a sessão é a mesma do início ao fim).
    try {
        if (request.agent.agent) await client.session.switchAgent({ sessionID: sessionId, agent: request.agent.agent })
        if (request.agent.model) await client.session.switchModel({ sessionID: sessionId, model: toOpencodeModelRef(request.agent.model, request.agent.variant) })
    } catch (error) {
        const result: TurnResult = { outcome: "failed", text: "", message: `Não foi possível selecionar o agente/modelo da etapa: ${message(error)}`, costUsd: 0, durationMs: Date.now() - startedAt }
        publish({ type: "turn-end", outcome: "failed", message: result.message, durationMs: result.durationMs, costUsd: 0 })
        return result
    }

    let resolveEnd: (end: End) => void = () => undefined
    const ended = new Promise<End>((resolve) => {
        resolveEnd = resolve
    })
    let finished = false
    const finish = (end: End) => {
        if (finished) return
        finished = true
        resolveEnd(end)
    }

    const subscription = new AbortController()
    let readyResolve: () => void = () => undefined
    const ready = new Promise<void>((resolve) => {
        readyResolve = resolve
    })

    const handle = async (raw: unknown) => {
        const event = normalizeOpencodeEvent(raw, sessionId)
        if (!event) return
        switch (event.kind) {
            case "text":
                text += event.delta
                publish({ type: "text", text: event.delta })
                break
            case "reasoning":
                publish({ type: "reasoning" })
                break
            case "tool-start":
                toolNames.set(event.id, event.name)
                publish({ type: "tool", id: event.id, name: event.name, state: "running" })
                break
            case "tool-called": {
                const input = describeToolInput(event.input)
                toolInputs.set(event.id, input)
                publish({ type: "tool", id: event.id, name: toolNames.get(event.id) ?? "ferramenta", state: "running", input })
                break
            }
            case "tool-progress":
                if (event.output) publish({ type: "tool-progress", id: event.id, output: event.output.slice(-20_000) })
                break
            case "tool-done":
                publish({ type: "tool", id: event.id, name: toolNames.get(event.id) ?? "ferramenta", state: "done", input: toolInputs.get(event.id) ?? null, output: event.output })
                break
            case "tool-error":
                publish({ type: "tool", id: event.id, name: toolNames.get(event.id) ?? "ferramenta", state: "error", input: toolInputs.get(event.id) ?? null, output: event.output || null, error: event.message })
                break
            case "step":
                costUsd += event.costUsd
                await hooks.onStep?.({ costUsd: event.costUsd, tokens: event.tokens })
                break
            case "notice":
                publish({ type: "notice", level: "warn", message: event.message })
                break
            case "permission":
                publish({ type: "permission", permission: event.permission })
                await hooks.onPermission?.(event.permission)
                break
            case "permission-replied":
                await hooks.onPermissionClosed?.(event.id)
                break
            case "form":
                publish({ type: "form", form: event.form })
                await hooks.onForm?.(event.form)
                break
            case "form-closed":
                publish({ type: "form-closed", id: event.id })
                await hooks.onFormClosed?.(event.id)
                break
            case "moved":
                publish({ type: "notice", level: "info", message: `Sessão movida para ${event.directory}` })
                await hooks.onMoved?.(event.directory)
                break
            case "end":
                finish(event.outcome === "succeeded" ? { outcome: "succeeded", message: null } : event.outcome === "failed" ? { outcome: "failed", message: event.message } : { outcome: "interrupted", message: event.reason === "user" ? "Interrompido" : `Interrompido (${event.reason})` })
                break
        }
    }

    // Assinatura do SSE com reconexão; ao reconectar, confere se a execução terminou no intervalo.
    const pump = (async () => {
        let attempts = 0
        while (!finished && !subscription.signal.aborted) {
            try {
                const iterable = client.event.subscribe({ signal: subscription.signal, onActivity: readyResolve })
                for await (const raw of iterable) {
                    readyResolve()
                    attempts = 0
                    await handle(raw).catch(() => undefined)
                    if (finished) break
                }
            } catch {
                // queda do stream: tenta de novo
            }
            if (finished || subscription.signal.aborted) break
            if (++attempts > MAX_RECONNECTS) {
                finish({ outcome: "failed", message: "Conexão com o OpenCode perdida durante a execução" })
                break
            }
            await sleep(RECONNECT_DELAY_MS)
            const info = await client.session.get({ sessionID: sessionId }).catch(() => null)
            if (info?.outcome && (info.time.idle ?? 0) >= startedAt) {
                publish({ type: "notice", level: "warn", message: "A conexão com o OpenCode caiu; parte da saída pode não ter sido exibida" })
                finish({ outcome: info.outcome, message: info.outcome === "failed" ? "O agente terminou com erro" : info.outcome === "interrupted" ? "Interrompido" : null })
            }
        }
    })()

    const heartbeat = setInterval(() => void Promise.resolve(hooks.heartbeat?.()).catch(() => undefined), HEARTBEAT_MS)
    heartbeat.unref?.()

    let interruptRequested = false
    const interrupt = async (reason: string) => {
        if (interruptRequested || finished) return
        interruptRequested = true
        await client.session.interrupt({ sessionID: sessionId }).catch(() => undefined)
        setTimeout(() => finish({ outcome: "interrupted", message: reason }), INTERRUPT_GRACE_MS).unref?.()
    }
    const onAbort = () => void interrupt(request.signal.reason instanceof Error ? request.signal.reason.message : "Interrompido")
    request.signal.addEventListener("abort", onAbort, { once: true })
    const timeout = setTimeout(() => void interrupt(`Tempo limite da etapa (${Math.round(request.timeoutMs / 60_000)} min) atingido`), request.timeoutMs)
    timeout.unref?.()

    try {
        await Promise.race([ready, sleep(READY_TIMEOUT_MS)])
        if (request.signal.aborted) finish({ outcome: "interrupted", message: "Interrompido antes de começar" })
        else {
            try {
                await client.session.prompt({ sessionID: sessionId, text: request.text })
            } catch (error) {
                finish({ outcome: "failed", message: `O OpenCode recusou a mensagem: ${message(error)}` })
            }
        }
        const end = await ended
        const durationMs = Date.now() - startedAt
        publish({ type: "turn-end", outcome: end.outcome, message: end.message, durationMs, costUsd })
        return { outcome: end.outcome, text, message: end.message, costUsd, durationMs }
    } finally {
        clearInterval(heartbeat)
        clearTimeout(timeout)
        request.signal.removeEventListener("abort", onAbort)
        subscription.abort()
        await pump.catch(() => undefined)
    }
}
