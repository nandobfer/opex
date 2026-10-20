import type { AiFeatureAvailability } from "@/features/ai/types"
import type { OpexAgentSettings, OpexFilesSettings } from "./schemas"
import type { OpexToolGroup } from "./constants"
import type { OpexClientToolGroup } from "./client-tools"
import type { OpexFileKind } from "./files"
import type { OpexToolMetaDto } from "./tool-tree"

/** Arquivo enviado no chat (o binário fica no Storage S3). */
export interface OpexFileDto {
    id: string
    name: string
    mediaType: string
    size: number
    kind: OpexFileKind
    /** Rota do conteúdo (sem `basePath`). */
    url: string
}

/** Reserva do envio: onde e como o navegador faz o PUT direto no storage. */
export interface OpexFileReservationDto {
    id: string
    method: "PUT"
    /** URL assinada (absoluta) do storage. */
    url: string
    /** Cabeçalhos obrigatórios do PUT (o `Content-Type` entra na assinatura). */
    headers: Record<string, string>
    expiresIn: number
}

export interface OpexAgentSettingsDto {
    settings: OpexAgentSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
    /** Ferramentas do dono (metadados para a árvore de seleção e confirmação). */
    tools: OpexToolMetaDto[]
}

/** Configuração do Agente Opex de um cliente do portal (tela do dono). */
export interface OpexClientAgentConfigDto {
    enabled: boolean
    /** Ferramentas ligadas (o contexto entra sempre). */
    enabledTools: string[]
}

/** Situação do Agente Opex no portal do cliente. */
export interface OpexClientStatusDto {
    enabled: boolean
    available: boolean
    reason: string | null
    /** Provedor · modelo configurado pelo dono (sem segredos). */
    modelLabel: string | null
    files: OpexFilesSettings
}

export type OpexSessionStatus = "idle" | "running" | "awaiting_confirmation" | "error"

export interface OpexSessionDto {
    id: string
    title: string
    summary: string
    titleSource: "auto" | "manual"
    status: OpexSessionStatus
    lastError: string | null
    archived: boolean
    messageCount: number
    lastMessageAt: string
    createdAt: string
}

export type OpexConfirmationStatus = "pending" | "confirmed" | "cancelled" | "failed" | "expired"

export interface OpexConfirmationDto {
    actionId: string
    summary: string
    status: OpexConfirmationStatus
    /** Mensagem de erro quando a execução confirmada falhou. */
    error: string | null
}

export type OpexToolState = "running" | "done" | "error"

export interface OpexToolPart {
    type: "tool"
    id: string
    name: string
    group: OpexToolGroup | OpexClientToolGroup | null
    label: string
    state: OpexToolState
    /** Entrada e saída resumidas (JSON) para exibição. */
    input: string | null
    output: string | null
    error: string | null
    confirmation: OpexConfirmationDto | null
    durationMs: number | null
}

/** Parte exibida de uma resposta do agente. */
export type OpexPart = { type: "text"; text: string } | { type: "reasoning"; text: string } | OpexToolPart

export interface OpexUsageDto {
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
}

export type OpexMessageStatus = "complete" | "interrupted" | "error"

export interface OpexMessageDto {
    id: string
    role: "user" | "assistant"
    /** `confirmation`: decisão do usuário sobre uma ação pendente (exibida como nota). */
    kind: "message" | "confirmation"
    text: string
    /** Arquivos enviados com a mensagem do usuário. */
    files: OpexFileDto[]
    parts: OpexPart[]
    status: OpexMessageStatus
    error: string | null
    usage: OpexUsageDto | null
    durationMs: number | null
    model: string | null
    createdAt: string
}

export interface OpexSessionDetailDto {
    session: OpexSessionDto
    messages: OpexMessageDto[]
}

/** Resposta em andamento (mantida em memória no servidor e reconstruída no cliente). */
export interface OpexLiveMessage {
    id: string
    parts: OpexPart[]
    startedAt: string
    /** Raciocinando agora (sem texto novo desde o último pedaço de raciocínio). */
    thinking: boolean
}

/** Linha do stream NDJSON `GET /api/opex/sessions/[id]/stream`. */
export type OpexStreamLine =
    | { type: "snapshot"; status: OpexSessionStatus; live: OpexLiveMessage | null }
    | { type: "turn-start"; messageId: string; startedAt: string }
    | { type: "text-delta"; text: string }
    | { type: "reasoning-delta"; text: string }
    | { type: "tool-start"; id: string; name: string; group: OpexToolGroup | OpexClientToolGroup | null; label: string }
    | { type: "tool-input"; id: string; input: string | null }
    | { type: "tool-end"; id: string; state: "done" | "error"; output: string | null; error: string | null; confirmation: OpexConfirmationDto | null; durationMs: number | null }
    | { type: "turn-end"; messageId: string; status: OpexMessageStatus; error: string | null }
    | { type: "ping" }
