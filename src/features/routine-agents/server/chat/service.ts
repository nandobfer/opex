import { DomainError } from "@/lib/api/route"
import { getAiProvider } from "@/lib/ai/providers"
import { decideAction } from "@/features/opex-agent/server/confirmations"
import { interruptSession, sendMessage } from "@/features/opex-agent/server/runner"
import { createSession, deleteSession, getSessionDetail, listSessions, updateSession } from "@/features/opex-agent/server/sessions"
import { openSessionStream } from "@/features/opex-agent/server/stream"
import { DEFAULT_OPEX_AGENT_SETTINGS } from "@/features/opex-agent/schemas"
import type { OpexClientStatusDto, OpexConfirmationDto, OpexMessageDto, OpexSessionDetailDto, OpexSessionDto } from "@/features/opex-agent/types"
import { loadAgentDoc } from "../shared"
import { assertRoutineChatAvailable, routineChatScope } from "./turn"

/**
 * Conversa com um agente rotineiro (OPE-160): as sessões ficam nas coleções do Agente Opex
 * (`agent: "routine"` + `routineAgentId`) e reaproveitam o runner, o stream e as confirmações dele. Só o
 * dono acessa (as rotas chamam `requireAdminSession`); sessão de outro agente responde 404.
 */

/** Escopo das sessões do agente (confere que o agente existe: 404 senão). */
async function scopeOf(agentId: string) {
    await loadAgentDoc(agentId)
    return routineChatScope(agentId)
}

export async function routineChatStatus(agentId: string): Promise<OpexClientStatusDto> {
    const agent = await loadAgentDoc(agentId)
    const files = DEFAULT_OPEX_AGENT_SETTINGS.files
    try {
        const model = assertRoutineChatAvailable(agent)
        return { enabled: true, available: true, reason: null, modelLabel: `${getAiProvider(model.provider).name} · ${model.model}`, files }
    } catch (error) {
        if (!(error instanceof DomainError)) throw error
        return { enabled: true, available: false, reason: error.message, modelLabel: null, files }
    }
}

export async function listRoutineChatSessions(agentId: string): Promise<OpexSessionDto[]> {
    return listSessions(await scopeOf(agentId))
}

export async function createRoutineChatSession(agentId: string, text: string | undefined, actorId: string): Promise<{ session: OpexSessionDto; message: OpexMessageDto | null }> {
    const scope = await scopeOf(agentId)
    // Agente indisponível: recusa antes de criar uma sessão vazia.
    assertRoutineChatAvailable(await loadAgentDoc(agentId))
    const session = await createSession(actorId, scope)
    const message = text ? await sendMessage(session.id, { text }, actorId, scope) : null
    return { session, message }
}

export async function getRoutineChatSession(agentId: string, sessionId: string): Promise<OpexSessionDetailDto> {
    return getSessionDetail(sessionId, await scopeOf(agentId))
}

export async function updateRoutineChatSession(agentId: string, sessionId: string, input: { title?: string; archived?: boolean }, actorId: string): Promise<OpexSessionDto> {
    return updateSession(sessionId, input, actorId, await scopeOf(agentId))
}

export async function deleteRoutineChatSession(agentId: string, sessionId: string, actorId: string): Promise<void> {
    await deleteSession(sessionId, actorId, await scopeOf(agentId))
}

export async function sendRoutineChatMessage(agentId: string, sessionId: string, input: { text: string; fileIds?: string[] }, actorId: string): Promise<OpexMessageDto> {
    return sendMessage(sessionId, input, actorId, await scopeOf(agentId))
}

export async function interruptRoutineChat(agentId: string, sessionId: string): Promise<void> {
    await interruptSession(sessionId, await scopeOf(agentId))
}

export async function openRoutineChatStream(agentId: string, sessionId: string, signal: AbortSignal): Promise<Response> {
    return openSessionStream(sessionId, signal, await scopeOf(agentId))
}

export async function decideRoutineChatAction(agentId: string, actionId: string, decision: "confirm" | "cancel", actorId: string): Promise<OpexConfirmationDto> {
    return decideAction(actionId, decision, actorId, await scopeOf(agentId))
}
