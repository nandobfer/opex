import type { OpencodeClient } from "@/lib/ai/opencode-client"
import { recordAiConsumption } from "@/lib/ai/consumption"
import { appendTextDelta, joinTextBlocks } from "@/lib/ai/opencode-text"
import {
    describeToolInput,
    isProviderLimitError,
    normalizeOpencodeEvent,
    retryNotice,
    shouldAbandonRetry,
    toOpencodeForm,
    toOpencodeModelRef,
    toOpencodePermission,
    type OpencodeFormDto,
    type OpencodePermissionDto,
    type OpencodeRetry,
    type OpencodeTokenUsage,
    type ProviderLimitPolicy,
} from "@/lib/ai/opencode-events"
import { SCHEDULE_TIMEZONE } from "@/lib/integrations/schedule"

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
    /**
     * Inclui a entrada completa das ferramentas (`rawInput`) nos eventos `tool`. Só para quem trata a
     * entrada antes de exibir ou gravar (Agente Maddox, que aplica o `redact` das ferramentas do Opex);
     * os demais (mesas, forks, revisões) recebem só o resumo cortado.
     */
    exposeRawToolInput?: boolean
    /** Arquivos anexados à mensagem (`uri` pode ser `data:<mime>;base64,…`), enviados junto do texto. */
    files?: readonly { uri: string; name: string }[]
    /**
     * Limite/cota do provedor: com a política, o turno desiste das novas tentativas do OpenCode (que
     * respeitam o `retry-after`, às vezes de horas), interrompe a execução e termina como falha do
     * modelo (`limited`) — para quem tem modelos de fallback (mesa e fork). Sem ela, o OpenCode segue
     * tentando como antes.
     */
    providerLimit?: ProviderLimitPolicy
}

/** Evento neutro de um turno; quem publica decide o canal (barramento da mesa, etc.). */
export type TurnEvent =
    | { type: "turn"; stage: string; title: string; agent: string | null; model: string | null }
    | { type: "text"; text: string }
    | { type: "reasoning"; text?: string }
    | {
          type: "tool"
          id: string
          name: string
          state: "running" | "done" | "error"
          input?: string | null
          output?: string | null
          error?: string | null
          /** Entrada completa da chamada (quem publica decide o que exibir; pode conter segredos). */
          rawInput?: Record<string, unknown> | null
      }
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
    /** A falha foi o limite de uso/cota do provedor (desistência das novas tentativas do OpenCode). */
    limited?: boolean
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
        const parts = chosen
            .flatMap((item) => (item.type === "assistant" ? (item.content ?? []) : []))
            .filter((part) => part.type === "text")
            .map((part) => part.text)
        return joinTextBlocks(parts)
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

type End = { outcome: TurnResult["outcome"]; message: string | null; failure?: "model"; limited?: boolean }

const retryTime = new Intl.DateTimeFormat("pt-BR", { timeZone: SCHEDULE_TIMEZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

/** Motivo da desistência: "Limite de uso do provedor em anthropic/opus (provider.rate-limit: …); o OpenCode só tentaria de novo em 03/11, 18:40". */
export function providerLimitMessage(retry: OpencodeRetry, model: string | null): string {
    const where = model ? ` em ${model}` : ""
    const detail = retry.error.type ? `${retry.error.type}: ${retry.error.message}` : retry.error.message
    const next = retry.at > 0 ? `; o OpenCode só tentaria de novo em ${retryTime.format(new Date(retry.at))}` : ""
    return `Limite de uso do provedor${where} (${detail})${next}`
}

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
 * ou está trocando de etapa) e nada foi enviado. `files`: anexos da mensagem (`data:` URI), como no turno.
 */
export async function steerAgentTurn(id: string, text: string, files: readonly { uri: string; name: string }[] = []): Promise<boolean> {
    const live = liveTurns.get(id)
    if (!live || live.finished()) return false
    const attached = files.length ? { files: files.map((file) => ({ uri: file.uri, name: file.name })) } : {}
    await live.client.session.prompt({ sessionID: live.sessionId, text, delivery: "steer", ...attached })
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
    // Bloco de texto atual: um delta de outra parte/mensagem, ou depois de um evento que não é texto,
    // começa em linha nova no texto do turno (a saída publicada segue com o delta original).
    let lastTextBlock: string | null = null
    let textBoundary = false
    let costUsd = 0
    const toolNames = new Map<string, string>()
    const toolInputs = new Map<string, string | null>()
    const toolRawInputs = new Map<string, Record<string, unknown>>()
    const rawOf = (id: string) => (request.exposeRawToolInput ? { rawInput: toolRawInputs.get(id) ?? null } : {})
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

    let interruptRequested = false
    // Parar do usuário (o abort chega antes do fim da desistência por limite, que espera até 15 s).
    let userStop = false
    // Limite/cota do provedor: fim já decidido, aguardando a execução parar no OpenCode.
    let limitEnd: End | null = null
    /** Fim da desistência: o Parar do usuário manda mais que o limite (a mesa fica "interrompida", não falha). */
    const limitFinish = (end: End): End => (userStop ? { outcome: "interrupted", message: request.signal.reason instanceof Error ? request.signal.reason.message : "Interrompido" } : end)
    const abandonForLimit = async (retry: OpencodeRetry) => {
        const reason = providerLimitMessage(retry, request.agent.model)
        interruptRequested = true
        limitEnd = { outcome: "failed", message: reason, failure: "model", limited: true }
        publish({ type: "notice", level: "warn", message: `${reason}. Desistindo das novas tentativas do OpenCode.` })
        const end = limitEnd
        setTimeout(() => finish(limitFinish(end)), INTERRUPT_GRACE_MS).unref?.()
        await client.session.interrupt({ sessionID: sessionId }).catch(() => undefined)
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
        if (event.kind !== "text") textBoundary = true
        switch (event.kind) {
            case "text": {
                const newBlock = event.block ? event.block !== lastTextBlock : textBoundary
                const appended = appendTextDelta(text, event.delta, newBlock)
                text = appended.text
                if (event.block) lastTextBlock = event.block
                textBoundary = false
                publish({ type: "text", text: event.delta })
                await hooks.onText?.(appended.piece)
                break
            }
            case "reasoning":
                publish(event.delta ? { type: "reasoning", text: event.delta } : { type: "reasoning" })
                break
            case "tool-start":
                toolNames.set(event.id, event.name)
                publish({ type: "tool", id: event.id, name: event.name, state: "running" })
                break
            case "tool-called": {
                const input = describeToolInput(event.input)
                toolInputs.set(event.id, input)
                if (request.exposeRawToolInput) toolRawInputs.set(event.id, event.input)
                publish({ type: "tool", id: event.id, name: toolNames.get(event.id) ?? "ferramenta", state: "running", input, ...rawOf(event.id) })
                break
            }
            case "tool-progress":
                if (event.output) publish({ type: "tool-progress", id: event.id, output: event.output.slice(-20_000) })
                break
            case "tool-done":
                publish({ type: "tool", id: event.id, name: toolNames.get(event.id) ?? "ferramenta", state: "done", input: toolInputs.get(event.id) ?? null, ...rawOf(event.id), output: event.output })
                break
            case "tool-error":
                publish({ type: "tool", id: event.id, name: toolNames.get(event.id) ?? "ferramenta", state: "error", input: toolInputs.get(event.id) ?? null, ...rawOf(event.id), output: event.output || null, error: event.message })
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
            case "retry":
                publish({ type: "notice", level: "warn", message: retryNotice(event) })
                if (request.providerLimit && !attach && !limitEnd && shouldAbandonRetry(event, Date.now(), request.providerLimit)) await abandonForLimit(event)
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
                // Desistência por limite: o fim (interrompido) que vier é o da interrupção pedida aqui.
                if (limitEnd) finish(limitFinish(limitEnd))
                else
                    finish(event.outcome === "succeeded" ? { outcome: "succeeded", message: null } : event.outcome === "failed" ? { outcome: "failed", message: event.message, failure: "model", ...(event.error && !attach && isProviderLimitError(event.error) ? { limited: true } : {}) } : { outcome: "interrupted", message: event.reason === "user" ? "Interrompido" : `Interrompido (${event.reason})` })
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
            if (!finished && limitEnd && info?.outcome) finish(limitFinish(limitEnd))
            else if (!finished && info?.outcome && (info.time.idle ?? 0) >= startedAt) {
                publish({ type: "notice", level: "warn", message: "A conexão com o OpenCode caiu; parte da saída pode não ter sido exibida" })
                finish({ outcome: info.outcome, message: info.outcome === "failed" ? "O agente terminou com erro" : info.outcome === "interrupted" ? "Interrompido" : null, ...(info.outcome === "failed" ? { failure: "model" as const } : {}) })
            }
        }
    })()

    const heartbeat = setInterval(() => void Promise.resolve(hooks.heartbeat?.()).catch(() => undefined), HEARTBEAT_MS)
    heartbeat.unref?.()

    const interrupt = async (reason: string) => {
        if (request.signal.aborted) userStop = true
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
                const files = request.files?.length ? { files: request.files.map((file) => ({ uri: file.uri, name: file.name })) } : {}
                await client.session.prompt({ sessionID: sessionId, text: request.text, ...files })
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
        return { outcome: end.outcome, text, message: end.message, costUsd, durationMs, ...(end.outcome === "failed" ? { failure: attach ? "other" : (end.failure ?? "other") } : {}), ...(end.limited ? { limited: true } : {}) }
    } finally {
        if (liveTurns.get(request.id) === live) liveTurns.delete(request.id)
        clearInterval(heartbeat)
        clearTimeout(timeout)
        request.signal.removeEventListener("abort", onAbort)
        subscription.abort()
        await pump.catch(() => undefined)
    }
}
