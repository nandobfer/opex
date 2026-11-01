/** Tipos da rede "universo de partículas" do Engramind (OPE-109), independentes da origem dos dados. */

export type MemoryStatus = "active" | "permanent" | "archived"

export interface NetworkMemory {
    id: string
    channel: string
    title: string
    text: string
    category: string
    status: MemoryStatus
    version: number
    createdAt: string
    updatedAt: string
    /** `retrieval_count` do Engramind (buscas). */
    retrievals: number
    /** `injected_count` do Engramind (entradas no contexto). */
    injections: number
    lastRetrievedAt: string | null
    verifiedAt: string | null
    /** `stale_candidate`: candidata a esquecimento pelo consolidador. */
    stale: boolean
    author: string | null
    /** Memória escrita pelo dono (listas dos agentes em `/integracoes/ia`). */
    fromOwner?: boolean
}

export interface NetworkAgent {
    /** `app/agente`. */
    id: string
    app: string
    /** Nome sem o prefixo "Agente". */
    name: string
}

export interface NetworkChannel {
    slug: string
    name: string
    archived: boolean
}

export type SubscriptionMode = "inject" | "search" | "manage"

export interface NetworkLink {
    id: string
    agent: string
    channel: string
    mode: SubscriptionMode
}

/** Payload de `engramind-consumption` (`private-app`): só ids e slugs. */
export interface ConsumptionEvent {
    /** `app/agente` (ex.: `opex/opex`). */
    agent: string
    kind: "context" | "search"
    /** Canais consultados. */
    channels: string[]
    /** Canais que entregaram ao menos uma memória (a partícula volta ao agente). */
    delivered: string[]
    memoryIds: string[]
}

export type UniverseRef = { kind: "channel"; slug: string } | { kind: "agent"; id: string }

/** Uso registrado pelo Opex (`GET /api/engramind/memory-usage`). */
export type MemoryUsageMap = Record<string, { lastUsedAt: string; liveCount: number }>
