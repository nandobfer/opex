/**
 * Histórico enviado ao modelo (módulo puro). Cada mensagem guardada carrega as mensagens da AI SDK
 * do seu turno inteiro (pedido do usuário, chamadas de ferramenta e resultados), então o corte é
 * sempre por turno — nunca separa uma chamada do resultado dela.
 */

/** Orçamento do histórico em caracteres de JSON (~100 mil tokens). */
export const OPEX_HISTORY_CHAR_BUDGET = 400_000

export interface StoredTurnMessages {
    role: "user" | "assistant"
    modelMessages: unknown[]
}

export interface SelectedHistory {
    messages: unknown[]
    /** Mensagens antigas que ficaram de fora (o resumo da sessão entra no lugar delas). */
    omitted: number
}

/** Tamanho em JSON, somando o peso dos arquivos (os marcadores `opex-file` carregam `weight`). */
export function historySize(value: unknown): number {
    let weights = 0
    const json =
        JSON.stringify(value, (_key, item: unknown) => {
            if (item && typeof item === "object" && (item as { type?: unknown }).type === "opex-file") weights += Number((item as { weight?: unknown }).weight) || 0
            return item
        }) ?? ""
    return json.length + weights
}

const sizeOf = historySize

export function selectHistory(stored: readonly StoredTurnMessages[], summary: string, budget = OPEX_HISTORY_CHAR_BUDGET): SelectedHistory {
    const kept: StoredTurnMessages[] = []
    let used = 0
    for (let index = stored.length - 1; index >= 0; index--) {
        const item = stored[index]!
        const size = sizeOf(item.modelMessages)
        if (kept.length > 0 && used + size > budget) break
        kept.unshift(item)
        used += size
    }
    // O histórico precisa começar por uma mensagem do usuário.
    while (kept.length > 1 && kept[0]!.role !== "user") kept.shift()
    const omitted = stored.length - kept.length
    const messages = kept.flatMap((item) => item.modelMessages)
    if (omitted > 0 && summary.trim()) {
        messages.unshift({ role: "user", content: `(Contexto: ${omitted} mensagens antigas desta sessão foram omitidas. Resumo da sessão até aqui: ${summary.trim()})` }, { role: "assistant", content: "Entendido." })
    }
    return { messages, omitted }
}

/** Troca a entrada das chamadas de ferramenta pela versão sem segredos. */
export function redactToolCalls(messages: readonly unknown[], redact: (toolName: string, input: unknown) => unknown): unknown[] {
    return messages.map((message) => {
        if (!message || typeof message !== "object") return message
        const typed = message as { role?: string; content?: unknown }
        if (typed.role !== "assistant" || !Array.isArray(typed.content)) return message
        return {
            ...typed,
            content: typed.content.map((part: unknown) => {
                if (!part || typeof part !== "object") return part
                const call = part as { type?: string; toolName?: string; input?: unknown }
                return call.type === "tool-call" && call.toolName ? { ...call, input: redact(call.toolName, call.input) } : part
            }),
        }
    })
}
