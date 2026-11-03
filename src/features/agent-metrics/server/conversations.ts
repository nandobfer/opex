import { dbConnect } from "@/lib/db"
import { AgentConversation, type IAgentConversationTool } from "@/lib/db/models/AgentMetrics"
import { OpexMessage, OpexSession } from "@/lib/db/models/Opex"
import { loggerFor } from "@/lib/logger"

const log = loggerFor({ module: "agent-metrics" })

interface MessagePart {
    type?: string
    name?: string
    state?: string
    confirmation?: { status?: string } | null
}

/** Estatística de uma conversa a partir das mensagens (função pura). */
export function conversationStats(messages: readonly { role: string; kind?: string; status?: string; usage?: { inputTokens?: number; outputTokens?: number } | null; parts?: readonly MessagePart[] | null }[]) {
    const tools = new Map<string, IAgentConversationTool>()
    let messageCount = 0
    let replies = 0
    let failedReplies = 0
    let confirmed = 0
    let cancelled = 0
    let inputTokens = 0
    let outputTokens = 0
    for (const message of messages) {
        if ((message.kind ?? "message") === "message") messageCount++
        if (message.role === "assistant" && (message.kind ?? "message") === "message") {
            replies++
            if (message.status === "error") failedReplies++
        }
        inputTokens += message.usage?.inputTokens ?? 0
        outputTokens += message.usage?.outputTokens ?? 0
        for (const part of message.parts ?? []) {
            if (part.type !== "tool" || !part.name) continue
            const tool = tools.get(part.name) ?? { name: part.name, calls: 0, failures: 0 }
            tool.calls++
            if (part.state === "error") tool.failures++
            tools.set(part.name, tool)
            if (part.confirmation?.status === "confirmed") confirmed++
            if (part.confirmation?.status === "cancelled") cancelled++
        }
    }
    return { messages: messageCount, replies, failedReplies, confirmed, cancelled, inputTokens, outputTokens, tools: [...tools.values()].sort((a, b) => b.calls - a.calls) }
}

/**
 * Sincroniza `agent_conversations` (estatística durável das conversas do Opex e do Maddox) a partir
 * das sessões alteradas desde `from` (ou das `sessionIds`). A estatística sobrevive à retenção.
 */
export async function syncConversations(options: { from?: Date; sessionIds?: readonly string[] } = {}): Promise<number> {
    await dbConnect()
    const filter = options.sessionIds ? { _id: { $in: [...options.sessionIds] } } : { updatedAt: { $gte: options.from ?? new Date(0) } }
    const sessions = await OpexSession.find(filter).select({ agent: 1, clientId: 1, userId: 1, title: 1, createdAt: 1, lastMessageAt: 1 }).lean()
    for (const session of sessions) {
        const messages = await OpexMessage.find({ sessionId: session._id }).select({ role: 1, kind: 1, status: 1, usage: 1, parts: 1 }).lean()
        const stats = conversationStats(messages as never)
        await AgentConversation.updateOne(
            { sessionId: String(session._id) },
            {
                $set: {
                    agent: session.agent ?? "opex",
                    scope: session.clientId ? "portal" : "owner",
                    clientId: session.clientId ?? null,
                    userId: session.userId ?? null,
                    title: session.title || null,
                    startedAt: session.createdAt,
                    lastMessageAt: session.lastMessageAt ?? null,
                    ...stats,
                    syncedAt: new Date(),
                },
                $setOnInsert: { costUsd: null, purgedAt: null },
            },
            { upsert: true },
        )
    }
    return sessions.length
}

/**
 * Antes de apagar uma conversa (retenção, exclusão ou cliente removido): grava a estatística final e
 * marca `purgedAt`. Nunca bloqueia a exclusão (falha vira aviso).
 */
export async function preserveConversations(sessionIds: readonly string[]): Promise<void> {
    if (!sessionIds.length) return
    try {
        await syncConversations({ sessionIds })
        await AgentConversation.updateMany({ sessionId: { $in: [...sessionIds] } }, { $set: { purgedAt: new Date() } })
    } catch (error) {
        log.warn({ err: error, sessions: sessionIds.length }, "Não foi possível preservar a estatística das conversas")
    }
}
