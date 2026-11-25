/**
 * Resposta do dono na conversa consigo mesmo (pura): com citação, vale para a pergunta citada; sem citação
 * e com uma só pendente, vale para ela; com várias pendentes e sem citação, o agente não adivinha e pede
 * que o dono cite a pergunta; sem pendentes, a mensagem é ignorada.
 */

export interface PendingQuestionRef {
    id: string
    /** Id da mensagem com a pergunta enviada ao dono (para casar com a citação). */
    sentMessageId: string | null
}

export type OwnerReplyResolution = { kind: "answer"; questionId: string } | { kind: "ask-quote"; pending: number } | { kind: "none"; reason: "no-pending" | "unknown-quote" | "empty" }

export function resolveOwnerReply(message: { quotedId: string | null; text: string }, pending: PendingQuestionRef[]): OwnerReplyResolution {
    if (!message.text.trim()) return { kind: "none", reason: "empty" }
    if (message.quotedId) {
        const quoted = pending.find((question) => question.sentMessageId === message.quotedId)
        if (quoted) return { kind: "answer", questionId: quoted.id }
        // Citou outra mensagem (ou uma pergunta já respondida): segue a regra sem citação.
    }
    if (pending.length === 0) return { kind: "none", reason: message.quotedId ? "unknown-quote" : "no-pending" }
    if (pending.length === 1) return { kind: "answer", questionId: pending[0]!.id }
    return { kind: "ask-quote", pending: pending.length }
}

export const ASK_QUOTE_MESSAGE = (count: number) =>
    `Tenho ${count} perguntas esperando resposta. Responda citando a pergunta (deslize a mensagem para o lado) para eu saber a qual você está respondendo.`
