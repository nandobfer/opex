import { historySize, OPEX_HISTORY_CHAR_BUDGET, stripPastReasoning } from "@/features/opex-agent/history"

/**
 * Histórico do motor Opex entre as ativações de uma execução (OPE-130, módulo puro). A execução que
 * hiberna de minuto em minuto acumula uma ativação por ciclo; sem corte, o contexto estoura a janela
 * do modelo (e o documento, o limite do Mongo). Por isso:
 * - o raciocínio das ativações passadas sai (a Anthropic recusa o bloco assinado reenviado);
 * - o corte é por **ativação** (mensagem do usuário + chamadas e resultados que a seguem), nunca separa
 *   uma chamada do resultado dela;
 * - a primeira ativação (o disparo, com a solicitação) fica sempre; das demais, ficam as mais recentes
 *   que cabem no orçamento, com um aviso no lugar das omitidas.
 */

export const ROUTINE_HISTORY_CHAR_BUDGET = OPEX_HISTORY_CHAR_BUDGET

const isUser = (message: unknown) => !!message && typeof message === "object" && (message as { role?: unknown }).role === "user"

/** Divide em ativações: cada uma começa numa mensagem do usuário. */
function activations(messages: readonly unknown[]): unknown[][] {
    const groups: unknown[][] = []
    for (const message of messages) {
        if (isUser(message) || groups.length === 0) groups.push([message])
        else groups[groups.length - 1]!.push(message)
    }
    return groups
}

export function omittedActivationsNote(count: number): { role: "user"; content: string } {
    return { role: "user", content: `(Contexto: ${count} ativações intermediárias desta execução foram omitidas para caber no contexto. As memórias e as entradas continuam valendo; confira o estado atual antes de agir.)` }
}

export function trimRoutineHistory<T>(messages: readonly T[], budget = ROUTINE_HISTORY_CHAR_BUDGET): T[] {
    const groups = activations(stripPastReasoning(messages))
    if (groups.length <= 1) return (groups[0] ?? []) as T[]
    const [first, ...rest] = groups
    let used = historySize(first)
    const kept: unknown[][] = []
    for (let index = rest.length - 1; index >= 0; index--) {
        const size = historySize(rest[index])
        if (kept.length > 0 && used + size > budget) break
        kept.unshift(rest[index]!)
        used += size
    }
    const omitted = rest.length - kept.length
    // O aviso entra como ativação própria, seguido de uma resposta curta (alternância usuário/assistente).
    const note = omitted > 0 ? [omittedActivationsNote(omitted), { role: "assistant", content: "Entendido." }] : []
    return [...first!, ...note, ...kept.flat()] as T[]
}
