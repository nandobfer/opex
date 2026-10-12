import type { OpencodeClient } from "@/lib/ai/opencode-client"
import { recordAiConsumption } from "@/lib/ai/consumption"
import { describeToolInput, normalizeOpencodeEvent, toOpencodeForm, toOpencodeModelRef, toOpencodePermission, type OpencodeFormDto, type OpencodePermissionDto, type OpencodeTokenUsage } from "@/lib/ai/opencode-events"

/**
 * Um turno de agente numa sessão longa do OpenCode (`@opencode/client`): troca agente/modelo, envia
 * a mensagem e acompanha os eventos até a execução terminar, repassando tudo pelo `publish`
 * informado. Genérico e SEM estado — serve à mesa de trabalho (`features/agentic`) e ao refinamento
 * de tarefas (`features/refinement`), que decidem o que fazer com o resultado.
 *
 * NÃO usa o `streamAi` (Vercel AI SDK): a sessão precisa sobreviver entre turnos e responder
 * permissões e perguntas (formulários), o que o `streamAi` não oferece.
 */

export interface TurnAgent {
    agent: string | null
    model: string | null
    variant: string | null
}

export interface TurnRequest {
    /** Identificador da execução (mesa ou refinamento) — usado só pelo `publish`. */
    id: string
    sessionId: string
    /** Rótulo curto da execução (ex.: "Planejando", "Refinando"). */
    stage: string
    title: string
    agent: TurnAgent
    text: string
    timeoutMs: number
    /** Abortado = interromper (botão Parar, exclusão, desligamento). */
    signal: AbortSignal
    /**
     * Reconexão: acompanha a execução em andamento na sessão SEM enviar prompt e SEM trocar
     * agente/modelo. Se a execução já terminou, o resultado é recuperado do histórico e fechado.
     */
    attach?: boolean
    /**
     * Instante (epoch ms) em que o turno começou; no modo `attach` delimita a execução acompanhada
     * (resultado do OpenCode só conta se ficou ocioso depois dele). Padrão: agora.
     */
    startedAt?: number
    /** Contexto do painel de consumo: origem (ex.: `agentic`, `refinement`) e referência. */
    consumption?: { origin: string; subject?: string | null }
}

/** Evento neutro de um turno; quem publica decide o canal (barramento da mesa, etc.). */
export type TurnEvent =
    | { type: "turn"; stage: string; title: string; agent: string | null; model: string | null }
    | { type: "text"; text: string }
    | { type: "reasoning" }
    | { type: "tool"; id: string; name: string; state: "running" | "done" | "error"; input?: string | null; output?: string | null; error?: string | null }
    | { type: "tool-progress"; id: string; output: string }
    | { type: "notice"; level: "info" | "warn" | "error" | "success"; message: string }
    | { type: "permission"; permission: OpencodePermissionDto }
    | { type: "permission-replied"; id: string; decision: string }
    | { type: "form"; form: OpencodeFormDto }
    | { type: "form-closed"; id: string }
    | { type: "turn-end"; outcome: "succeeded" | "failed" | "interrupted"; message: string | null; durationMs: number; costUsd: number }

export interface TurnHooks {
    /** Publica o evento (barramento). Sem `publish`, a saída não vai a lugar nenhum. */
    publish?: (event: TurnEvent) => void
    onPermission?: (permission: OpencodePermissionDto) => void | Promise<void>
    onPermissionClosed?: (id: string) => void | Promise<void>
    onForm?: (form: OpencodeFormDto) => void | Promise<void>
    onFormClosed?: (id: string) => void | Promise<void>
    /** Cada pedaço de texto do agente (para acumular e extrair, ex.: a especificação). */
    onText?: (delta: string) => void | Promise<void>
    onStep?: (usage: { costUsd: number; tokens: OpencodeTokenUsage; stepId?: string }) => void | Promise<void>
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

/**
 * Reconstrói o texto do turno a partir do histórico da sessão (usado na reconexão: parte da saída
 * pode ter passado antes de reatarmos). Junta as partes de texto das mensagens do assistente
 * criadas depois de `sinceMs` (ou, sem marco, apenas a última). Best-effort: falha vira string vazia.
 */
async function recoverTurnText(client: OpencodeClient, sessionId: string, sinceMs: number): Promise<string> {
    try {
        const response = await client.message.list({ sessionID: sessionId, type: "assistant", order: "desc", limit: 50 })
        const items = [...(response.data ?? [])].reverse()
        const relevant = sinceMs > 0 ? items.filter((item) => (item.time?.created ?? 0) >= sinceMs) : []
        const chosen = relevant.length ? relevant : items.slice(-1)
        return chosen
            .flatMap((item) => (item.type === "assistant" ? (item.content ?? []) : []))
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("")
    } catch {
        return ""
    }
}

type End = { outcome: TurnResult["outcome"]; message: string | null }

export async function runAgentTurn(client: OpencodeClient, request: TurnRequest, hooks: TurnHooks = {}): Promise<TurnResult> {
    const { sessionId } = request
    const attach = request.attach === true
    const startedAt = request.startedAt ?? Date.now()
    const beginAt = Date.now()
    const publish = (event: TurnEvent) => hooks.publish?.(event)
    // Na reconexão não há cabeçalho de turno novo (a execução é a mesma); só as alterações de estado.
    if (!attach) publish({ type: "turn", stage: request.stage, title: request.title, agent: request.agent.agent, model: request.agent.model })

    let text = ""
    let costUsd = 0
    const toolNames = new Map<string, string>()
    const toolInputs = new Map<string, string | null>()

    // Agente e modelo da etapa (a sessão é a mesma do início ao fim). Na reconexão, preserva o que já está na sessão.
    if (!attach) {
        try {
            if (request.agent.agent) await client.session.switchAgent({ sessionID: sessionId, agent: request.agent.agent })
            if (request.agent.model) await client.session.switchModel({ sessionID: sessionId, model: toOpencodeModelRef(request.agent.model, request.agent.variant) })
        } catch (error) {
            const result: TurnResult = { outcome: "failed", text: "", message: `Não foi possível selecionar o agente/modelo: ${message(error)}`, costUsd: 0, durationMs: Date.now() - beginAt }
            publish({ type: "turn-end", outcome: "failed", message: result.message, durationMs: result.durationMs, costUsd: 0 })
            return result
        }
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
                await hooks.onText?.(event.delta)
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
                await hooks.onStep?.({ costUsd: event.costUsd, tokens: event.tokens, stepId: event.stepId ?? undefined })
                if (request.consumption && event.stepId) {
                    await recordAiConsumption({
                        dedupKey: `session:${request.consumption.origin}:${request.id}:${event.stepId}`,
                        provider: "opencode",
                        origin: request.consumption.origin,
                        subject: request.consumption.subject ?? null,
                        model: request.agent.model ?? "",
                        inputTokens: event.tokens.input,
                        outputTokens: event.tokens.output,
                        totalTokens: event.tokens.input + event.tokens.output + event.tokens.reasoning,
                        costUsd: event.costUsd,
                    })
                }
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
            if (!finished && info?.outcome && (info.time.idle ?? 0) >= startedAt) {
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
    const timeout = setTimeout(() => void interrupt(`Tempo limite (${Math.round(request.timeoutMs / 60_000)} min) atingido`), request.timeoutMs)
    timeout.unref?.()

    // Reconexão: confere o estado da sessão ANTES de acompanhar. Se a execução já terminou, recupera o
    // resultado do histórico; se não há execução em andamento, não há o que reconectar.
    if (attach) {
        const info = await client.session.get({ sessionID: sessionId }).catch(() => null)
        if (!info) {
            finish({ outcome: "failed", message: "A sessão do OpenCode não existe mais; reconectar não é possível (use Tentar novamente para criar outra)" })
        } else {
            // Perguntas e permissões que ficaram pendentes durante a queda: o SSE é só ao vivo, então
            // restaura do estado atual da sessão (o hook deduplica por id).
            const [forms, permissions] = await Promise.all([
                client.session.form.list({ sessionID: sessionId }).catch(() => [] as unknown[]),
                client.permission.list({ sessionID: sessionId }).catch(() => [] as unknown[]),
            ])
            for (const raw of permissions) {
                const permission = toOpencodePermission(raw)
                if (permission) {
                    publish({ type: "permission", permission })
                    await hooks.onPermission?.(permission)
                }
            }
            for (const raw of forms) {
                const form = toOpencodeForm(raw)
                if (form) {
                    publish({ type: "form", form })
                    await hooks.onForm?.(form)
                }
            }
            const active = await client.session.active().catch(() => null)
            const running = Boolean(active && (active as Record<string, unknown>)[sessionId])
            if (!running) {
                const idle = info.time?.idle ?? 0
                if (info.outcome && idle >= startedAt) {
                    text = await recoverTurnText(client, sessionId, startedAt)
                    finish({ outcome: info.outcome, message: info.outcome === "failed" ? "O agente terminou com erro" : info.outcome === "interrupted" ? "Interrompido" : null })
                } else {
                    finish({ outcome: "interrupted", message: "Não há execução em andamento nesta sessão do OpenCode" })
                }
            }
        }
    }

    try {
        await Promise.race([ready, sleep(READY_TIMEOUT_MS)])
        if (request.signal.aborted) finish({ outcome: "interrupted", message: "Interrompido antes de começar" })
        else if (!attach) {
            try {
                await client.session.prompt({ sessionID: sessionId, text: request.text })
            } catch (error) {
                finish({ outcome: "failed", message: `O OpenCode recusou a mensagem: ${message(error)}` })
            }
        }
        const end = await ended
        // Reconectado: o texto pode ter começado antes de reatar; recupera o turno inteiro do histórico.
        if (attach && end.outcome === "succeeded") {
            const recovered = await recoverTurnText(client, sessionId, startedAt)
            if (recovered) text = recovered
        }
        const durationMs = Date.now() - beginAt
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
