import type { MemoryIdentity } from "@/features/ai/agents"

/**
 * Adoção do aprendizado autônomo por agente (OPE-117; módulo PURO, tipos e regras compartilhados entre
 * servidor e tela). A fonte das gravações é a auditoria do Opex (`audit_logs`, `entidade: MemoriaAgente`,
 * `dadosNovos.ator = agente:<identidade>`); o último contexto lido vem do rastreio por turno
 * (`engramind_deliveries`).
 */

/** Dias sem gravar (com o aprendizado ligado) que acendem o aviso discreto. */
export const ADOPTION_STALE_DAYS = 14
export const ADOPTION_WINDOW_DAYS = 7
const DAY_MS = 24 * 3600_000

export interface AgentDeliveryDto {
    fullIds: string[]
    titleIds: string[]
    overflow: number
    counts: { full: number; titles: number; overflow: number }
    channels: string[]
    delivered: string[]
    version: string
    focusMode: "hybrid" | "text" | "none" | null
    source: "live" | "not-modified"
    at: string
}

export interface AgentActivityDto {
    agent: MemoryIdentity
    /** Gravações (criar, editar, excluir) feitas pelo próprio agente. */
    total: number
    last7d: number
    lastWriteAt: string | null
    /** Último contexto entregue (só consumidores de contexto; o Mentor não lê). */
    delivery: AgentDeliveryDto | null
    /** `null` no Mentor (não tem aprendizado autônomo). */
    selfMemory: boolean | null
    /** Aprendizado ligado e sem gravar há `ADOPTION_STALE_DAYS` dias (ou nunca, com o agente mais antigo que isso). */
    stale: boolean
}

/**
 * Aviso de adoção: aprendizado ligado e a última gravação tem 14 dias ou mais; ou nunca gravou e o agente
 * existe há mais de 14 dias (sem a data de criação, não acende).
 */
export function isAdoptionStale(input: { selfMemory: boolean | null; lastWriteAt: string | Date | null; agentCreatedAt: string | Date | null }, now = new Date()): boolean {
    if (!input.selfMemory) return false
    const limit = now.getTime() - ADOPTION_STALE_DAYS * DAY_MS
    if (input.lastWriteAt) return new Date(input.lastWriteAt).getTime() <= limit
    return input.agentCreatedAt ? new Date(input.agentCreatedAt).getTime() < limit : false
}

export const windowStart = (now = new Date(), days = ADOPTION_WINDOW_DAYS) => new Date(now.getTime() - days * DAY_MS)
