import type { ChatEffects, ChatMessageDto } from "@/features/evolution-api/chat-message"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import type { ConversationAgentState, SecretaryDecision } from "./constants"

/** DTOs do Agente Secretário compartilhados entre rotas e telas. */

export interface DecisionRowDto {
    _id: string
    jid: string
    decision: SecretaryDecision
    reason: string
    at: string
}

export interface DecisionPageDto {
    items: DecisionRowDto[]
    page: number
    limit: number
    total: number
    totalPages: number
}

/** Conversa da aba Conversas: contato, estado do Secretário, prévia e não lidas do WhatsApp (OPE-197). */
export interface SecretaryConversationDto extends EvolutionContactDto {
    chatId: string
    state: ConversationAgentState
    pausedUntil: string | null
}

/** Decisão exibida como pílula na linha do tempo (D3). */
export interface TimelineDecisionDto {
    id: string
    decision: SecretaryDecision
    reason: string
    at: string
}

/** Página da linha do tempo: mensagens (mais antigas primeiro), decisões no intervalo e ids enviados pelo Secretário. */
export interface ChatTimelinePageDto {
    items: ChatMessageDto[]
    /** Efeitos (reação, edição, apagar) cujo alvo está em outra página. */
    effects: ChatEffects
    decisions: TimelineDecisionDto[]
    agentMessageIds: string[]
    page: number
    hasOlder: boolean
}
