import type { EvolutionConnectionState, EvolutionInstanceOptionKey } from "./constants"

export interface EvolutionLastEventDto {
    at: string
    event: string
    ok: boolean
    message: string | null
}

export interface EvolutionQrDto {
    mode: "qr" | "pairing"
    /** Imagem `data:image/png;base64,…` do QR (modo `qr`). */
    base64: string | null
    /** Código numérico de pareamento (modo `pairing`). */
    pairingCode: string | null
    count: number
    limit: number
    generatedAt: string
    expiresAt: string
}

export interface EvolutionProfileDto {
    name: string | null
    number: string | null
    pictureUrl: string | null
    /** Nome de usuário do WhatsApp, só quando a Evolution devolve. */
    username: string | null
}

export interface EvolutionInstanceDto {
    name: string
    state: EvolutionConnectionState
    rawState: string
    profile: EvolutionProfileDto | null
    qr: EvolutionQrDto | null
    qrLimitReached: boolean
    lastEvent: EvolutionLastEventDto | null
    webhookRegisteredAt: string | null
    webhookError: string | null
    /** Manager da Evolution (URL pública + /manager), quando configurada. */
    managerUrl: string | null
    /** Erro ao consultar a Evolution (a tela mostra com "Tentar novamente"). */
    error: string | null
}

export interface EvolutionInstanceSummaryDto {
    name: string
    state: EvolutionConnectionState
    profileName: string | null
    number: string | null
}

export interface EvolutionInstancesDto {
    defaultInstance: string | null
    instances: EvolutionInstanceSummaryDto[]
    error: string | null
}

export type EvolutionInstanceOptionsDto = Record<EvolutionInstanceOptionKey, boolean> & { readMessages: false }

export interface EvolutionWebhookDto {
    instance: string | null
    url: string | null
    defaultUrl: string
    secretConfigured: boolean
    events: string[]
    /** Como está na instância (Evolution `webhook/find`). */
    registered: { enabled: boolean; url: string | null; events: string[] } | null
    matches: boolean
    lastEvent: EvolutionLastEventDto | null
    webhookRegisteredAt: string | null
    webhookError: string | null
    error: string | null
}

export interface EvolutionContactDto {
    jid: string
    name: string
    number: string | null
    pictureUrl: string | null
    isGroup: boolean
    lastMessageAt: string | null
    /** Prévia da última mensagem e não lidas do WhatsApp (aba Conversas do Secretário, OPE-197). */
    lastMessage?: { text: string; kind: string; fromMe: boolean } | null
    unreadCount?: number
}

export interface EvolutionNumberCheckDto {
    number: string
    exists: boolean
    jid: string | null
    name: string | null
}
