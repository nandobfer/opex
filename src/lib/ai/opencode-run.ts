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
    /**
     * Causa da falha: `model` = o modelo/provedor falhou (execução encerrada com erro pelo OpenCode,
     * modelo não selecionável ou mensagem recusada) — elegível a modelo de fallback; `other` = conexão,
     * sessão, tempo limite etc. Ausente quando o turno não falhou.
     */
    failure?: "model" | "other"
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

/**
 * Estado atual da sessão para reconectar: em andamento, terminada durante a queda (com o desfecho)
 * ou sem nada a acompanhar. `get` resolvendo `null` = sessão inexistente; erro de rede/timeout vira
 * `unavailable` (transitório — não é o mesmo que sessão inexistente).
 */
export type AttachProbe =
    | { kind: "unavailable" }
    | { kind: "missing-session" }
    | { kind: "running" }
    | { kind: "finished"; outcome: TurnResult["outcome"]; message: string | null }
    | { kind: "idle" }

/** Confere o estado da sessão antes de acompanhar (attach): distingue "o que acompanhar" do "nada". */
export async function probeAttachSession(client: OpencodeClient, sessionId: string, startedAt: number): Promise<AttachProbe> {
    let info: Awaited<ReturnType<OpencodeClient["session"]["get"]>>
    try {
        info = await client.session.get({ sessionID: sessionId })
    } catch {
        return { kind: "unavailable" }
    }
    if (!info) return { kind: "missing-session" }
    let running = false
    try {
        // Método ausente numa versão antiga do cliente não é queda: cai no desfecho do `outcome`.
        if (typeof client.session.active === "function") {
            const active = await client.session.active()
            running = Boolean(active && (active as Record<string, unknown>)[sessionId])
        }
    } catch {
        return { kind: "unavailable" }
    }
    if (running) return { kind: "running" }
    if (info.outcome && (info.time?.idle ?? 0) >= startedAt) {
        return { kind: "finished", outcome: info.outcome, message: info.outcome === "failed" ? "O agente terminou com erro" : info.outcome === "interrupted" ? "Interrompido" : null }
    }
    return { kind: "idle" }
}

type End = { outcome: TurnResult["outcome"]; message: string | null; failure?: "model" }

/** Turnos acompanhados agora, por `request.id` (mesa, fork ou refinamento): quem pode receber mensagem no meio da execução. */
interface LiveTurn {
    client: OpencodeClient
    sessionId: string
    finished: () => boolean
}
const globalLive = globalThis as unknown as { __opencodeLiveTurns?: Map<string, LiveTurn> }
const liveTurns = (globalLive.__opencodeLiveTurns ??= new Map())

/** Há um turno em andamento (ainda não terminado) acompanhado com este id? */
export function isAgentTurnLive(id: string): boolean {
    const live = liveTurns.get(id)
    return Boolean(live && !live.finished())
}

/**
 * Mensagem do usuário no meio da execução em andamento (`delivery: "steer"`): entra como contexto do
 * turno atual, sem interromper nem abrir turno novo. `false` = não há turno vivo com esse id (terminou
 * ou está trocando de etapa) e nada foi enviado.
 */
export async function steerAgentTurn(id: string, text: string): Promise<boolean> {
    const live = liveTurns.get(id)
    if (!live || live.finished()) return false
    await live.client.session.prompt({ sessionID: live.sessionId, text, delivery: "steer" })
    return true
}

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
    // Pendências vivas NESTE acompanhamento (dedupe por id): nem o evento ao vivo nem a releitura do
    // estado (reconexão) publicam duas vezes a mesma pergunta/permissão.
    const liveForms = new Map<string, OpencodeFormDto>()
    const livePermissions = new Map<string, OpencodePermissionDto>()

    const emitForm = async (form: OpencodeFormDto) => {
        if (liveForms.has(form.id)) return
        liveForms.set(form.id, form)
        publish({ type: "form", form })
        await hooks.onForm?.(form)
    }
    const emitPermission = async (permission: OpencodePermissionDto) => {
        if (livePermissions.has(permission.id)) return
        livePermissions.set(permission.id, permission)
        publish({ type: "permission", permission })
        await hooks.onPermission?.(permission)
    }
    const closeForm = async (id: string) => {
        if (!liveForms.delete(id)) return
        publish({ type: "form-closed", id })
        await hooks.onFormClosed?.(id)
    }
    const closePermission = async (id: string) => {
        if (!livePermissions.delete(id)) return
        await hooks.onPermissionClosed?.(id)
    }

    /**
     * Relê as pendências da sessão e publica só o que ainda não foi emitido neste acompanhamento — o
     * SSE é ao vivo, então o que nasceu num buraco de conexão nunca chegou. O que saiu da lista
     * (respondido/dispensado em outro lugar durante a queda) é fechado aqui. Falha de leitura é
     * transitória: mantém o que já foi emitido e tenta de novo na próxima reconexão.
     */
    const syncSessionPending = async (): Promise<boolean> => {
        let forms: unknown[]
        let permissions: unknown[]
        try {
            ;[forms, permissions] = await Promise.all([client.session.form.list({ sessionID: sessionId }), client.permission.list({ sessionID: sessionId })])
        } catch {
            return false
        }
        const formIds = new Set<string>()
        for (const raw of forms) {
            const form = toOpencodeForm(raw)
            if (!form) continue
            formIds.add(form.id)
            await emitForm(form)
        }
        for (const id of [...liveForms.keys()]) if (!formIds.has(id)) await closeForm(id)
        const permissionIds = new Set<string>()
        for (const raw of permissions) {
            const permission = toOpencodePermission(raw)
            if (!permission) continue
            permissionIds.add(permission.id)
            await emitPermission(permission)
        }
        for (const id of [...livePermissions.keys()]) if (!permissionIds.has(id)) await closePermission(id)
        return true
    }

    // Agente e modelo da etapa (a sessão é a mesma do início ao fim). Na reconexão, preserva o que já está na sessão.
    if (!attach) {
        try {
            if (request.agent.agent) await client.session.switchAgent({ sessionID: sessionId, agent: request.agent.agent })
            if (request.agent.model) await client.session.switchModel({ sessionID: sessionId, model: toOpencodeModelRef(request.agent.model, request.agent.variant) })
        } catch (error) {
            const result: TurnResult = { outcome: "failed", text: "", message: `Não foi possível selecionar o agente/modelo: ${message(error)}`, costUsd: 0, durationMs: Date.now() - beginAt, failure: "model" }
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

    const live: LiveTurn = { client, sessionId, finished: () => finished }
    liveTurns.set(request.id, live)

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
                await emitPermission(event.permission)
                break
            case "permission-replied":
                await closePermission(event.id)
                break
            case "form":
                await emitForm(event.form)
                break
            case "form-closed":
                await closeForm(event.id)
                break
            case "moved":
                publish({ type: "notice", level: "info", message: `Sessão movida para ${event.directory}` })
                await hooks.onMoved?.(event.directory)
                break
            case "end":
                finish(event.outcome === "succeeded" ? { outcome: "succeeded", message: null } : event.outcome === "failed" ? { outcome: "failed", message: event.message, failure: "model" } : { outcome: "interrupted", message: event.reason === "user" ? "Interrompido" : `Interrompido (${event.reason})` })
                break
        }
    }

    // Assinatura do SSE com reconexão; ao reconectar, relê as pendências do buraco e confere se a execução terminou no intervalo.
    const pump = (async () => {
        let attempts = 0
        let dropped = false
        while (!finished && !subscription.signal.aborted) {
            try {
                const iterable = client.event.subscribe({ signal: subscription.signal, onActivity: readyResolve })
                let first = true
                for await (const raw of iterable) {
                    readyResolve()
                    attempts = 0
                    if (first) {
                        first = false
                        // Voltou depois de uma queda: o que foi criado no buraco nunca chegou pelo SSE.
                        if (dropped) await syncSessionPending().catch(() => undefined)
                    }
                    await handle(raw).catch(() => undefined)
                    if (finished) break
                }
            } catch {
                // queda do stream: tenta de novo
            }
            dropped = true
            if (finished || subscription.signal.aborted) break
            if (++attempts > MAX_RECONNECTS) {
                finish({ outcome: "failed", message: "Conexão com o OpenCode perdida durante a execução" })
                break
            }
            await sleep(RECONNECT_DELAY_MS)
            const info = await client.session.get({ sessionID: sessionId }).catch(() => null)
            if (!finished && info?.outcome && (info.time.idle ?? 0) >= startedAt) {
                publish({ type: "notice", level: "warn", message: "A conexão com o OpenCode caiu; parte da saída pode não ter sido exibida" })
                finish({ outcome: info.outcome, message: info.outcome === "failed" ? "O agente terminou com erro" : info.outcome === "interrupted" ? "Interrompido" : null, ...(info.outcome === "failed" ? { failure: "model" as const } : {}) })
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
        const probe = await probeAttachSession(client, sessionId, startedAt)
        if (probe.kind === "missing-session") {
            finish({ outcome: "failed", message: "A sessão do OpenCode não existe mais; reconectar não é possível (use Tentar novamente para criar outra)" })
        } else if (probe.kind === "unavailable") {
            finish({ outcome: "failed", message: "Não foi possível falar com o OpenCode para reconectar" })
        } else if (probe.kind === "idle") {
            finish({ outcome: "interrupted", message: "Não há execução em andamento nesta sessão do OpenCode" })
        } else {
            // Perguntas e permissões que ficaram pendentes durante a queda: relê do estado da sessão.
            await syncSessionPending()
            if (probe.kind === "finished") {
                text = await recoverTurnText(client, sessionId, startedAt)
                finish({ outcome: probe.outcome, message: probe.message })
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
                finish({ outcome: "failed", message: `O OpenCode recusou a mensagem: ${message(error)}`, failure: "model" })
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
        return { outcome: end.outcome, text, message: end.message, costUsd, durationMs, ...(end.outcome === "failed" ? { failure: attach ? "other" : (end.failure ?? "other") } : {}) }
    } finally {
        if (liveTurns.get(request.id) === live) liveTurns.delete(request.id)
        clearInterval(heartbeat)
        clearTimeout(timeout)
        request.signal.removeEventListener("abort", onAbort)
        subscription.abort()
        await pump.catch(() => undefined)
    }
}
