/**
 * Rodízio das chaves em uso de um provedor de IA (OPE-179) — módulo PURO. A ordem do rodízio, quais
 * respostas contam como falha da chave (e passam para a próxima) e a mensagem quando todas falham.
 */

/** Falhas da chave (não do pedido): recusada (401/403), sem saldo (402) e limite ou cota (429). 5xx não conta. */
export const KEY_FAILURE_STATUSES = [401, 402, 403, 429] as const

export function isKeyFailureStatus(status: number): boolean {
    return (KEY_FAILURE_STATUSES as readonly number[]).includes(status)
}

/** A lista começando na posição `cursor` (circular). */
export function rotateFrom<T>(list: readonly T[], cursor: number): T[] {
    if (list.length === 0) return []
    const start = ((cursor % list.length) + list.length) % list.length
    return [...list.slice(start), ...list.slice(0, start)]
}

export interface KeyFailure {
    name: string
    status: number
}

export function keyFailureReason(status: number): string {
    if (status === 401 || status === 403) return "chave recusada"
    if (status === 402) return "sem saldo ou cota"
    if (status === 429) return "limite ou cota"
    return "falha"
}

/** Ex.: Todas as chaves em uso do Gemini falharam: “Pessoal” (HTTP 401, chave recusada), “Trabalho” (HTTP 429, limite ou cota). */
export function keyFailuresMessage(label: string, failures: readonly KeyFailure[]): string {
    const list = failures.map((failure) => `“${failure.name}” (HTTP ${failure.status}, ${keyFailureReason(failure.status)})`).join(", ")
    return `Todas as chaves em uso do ${label} falharam: ${list}.`
}
