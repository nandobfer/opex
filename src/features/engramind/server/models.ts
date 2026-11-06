import { Schema, model, models, type Model } from "mongoose"
import { dbConnect } from "@/lib/db"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"
import type { MemoryIdentity } from "@/features/ai/agents"

/** Coleções da integração Engramind (índices garantidos no primeiro uso). Ver `aicontext/modules/engramind.md`. */

/** Ids de eventos de webhook já recebidos (descarta repetições; somem em 24 h). */
export interface IEngramindWebhookEvent {
    _id: string
    type: string
    receivedAt: Date
}

/** Último snapshot da "IA do Opex" de uma seção (sem segredo; a chave fica só no Opex e no Engramind). */
export interface IEngramindAiSource {
    provider: string
    model: string | null
    fallbackModels: string[]
    dimensions: number | null
    /** Temperatura do Redator aplicada (`null` = padrão do modelo). */
    temperature?: number | null
    /** `version` da integração `ai_*` na última cópia da chave. */
    keyVersion: string | null
    syncedAt: Date | null
    syncError: string | null
    appliedAt: Date
}

/** Token `agent` de um agente de memórias do Opex (segredo cifrado; nunca exibido). */
export interface IEngramindAgentToken {
    tokenId: string
    prefix: string
    secret: EncryptedSecret
    issuedAt: Date
}

/** Saúde do contexto das memórias dos agentes (aviso "Engramind indisponível"). */
export interface IEngramindMemoryContextState {
    lastOkAt: Date | null
    unavailableSince: Date | null
    lastError: string | null
}

/**
 * Estado da instalação (singleton `_id: "engramind"`): alterações do `.env` ainda não aplicadas, a
 * origem da IA do Redator e do embedding (`sources`), os tokens dos agentes de memórias
 * (`agentTokens`) e a saúde do contexto (`memoryContext`).
 */
export interface IEngramindState {
    _id: string
    pendingApply: { keys: string[]; at: Date; previous: Record<string, string> } | null
    sources?: { redator?: IEngramindAiSource | null; embedding?: IEngramindAiSource | null } | null
    agentTokens?: Partial<Record<MemoryIdentity, IEngramindAgentToken>> | null
    memoryContext?: IEngramindMemoryContextState | null
    /**
     * Token `kind: app` do app opex (OPE-117) que provisiona agentes, assinaturas e tokens de agente: só o
     * id e o prefixo (o segredo é o campo privado `appToken` da integração).
     */
    appToken?: { tokenId: string; prefix: string; issuedAt: Date } | null
    /** Layout dos universos de memórias (OPE-142): a configuração gravada e quando; sem ela vale o padrão da lib. */
    universeLayout?: { config: Record<string, unknown>; updatedAt: Date } | null
}

/** Último contexto de memórias recebido por agente e combinação de canais (reserva com o Engramind fora do ar). */
export interface IEngramindContextCache {
    _id: string
    consumer: string
    channels: string[]
    content: string
    version: string
    counts: { full: number; titles: number; overflow: number }
    /** Formato do bloco (`tagged` desde a OPE-109; cache antigo sem o campo = `markdown`). */
    format?: string
    /** Ids da faixa 1 do bloco (a resposta `304` também anima o consumo). */
    memoryIds?: string[]
    /** Canais que entregaram ao menos uma memória. */
    delivered?: string[]
    /** Ids da faixa 2 (só título), para o rastreio da entrega na resposta `304`. */
    titleIds?: string[]
    /** SHA-256 do foco normalizado do bloco em cache (nunca o texto): o `If-None-Match` só vale com o mesmo foco. */
    focusHash?: string | null
    /** Modo do foco do bloco em cache (`hybrid`; blocos degradados não entram). */
    focusMode?: "hybrid" | "text" | "none" | null
    fetchedAt: Date
}

/**
 * Última entrega do contexto por consumidor (OPE-117, `_id` = consumidor): ids por faixa, canais,
 * `version` e modo do foco. Nunca guarda o texto das memórias nem o foco; sobrescrita a cada turno.
 */
export interface IEngramindDelivery {
    _id: string
    fullIds: string[]
    titleIds: string[]
    overflow: number
    counts: { full: number; titles: number; overflow: number }
    channels: string[]
    delivered: string[]
    version: string
    focusMode: "hybrid" | "text" | "none" | null
    source: "live" | "not-modified"
    at: Date
}

const webhookEventSchema = new Schema<IEngramindWebhookEvent>(
    { _id: { type: String, required: true }, type: { type: String, required: true }, receivedAt: { type: Date, required: true } },
    { collection: "engramind_webhook_events", versionKey: false },
)
webhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 24 * 3600, name: "received_ttl" })

const stateSchema = new Schema<IEngramindState>(
    {
        _id: { type: String, required: true },
        pendingApply: { type: new Schema({ keys: [String], at: Date, previous: { type: Schema.Types.Mixed, default: {} } }, { _id: false }), default: null },
        sources: { type: Schema.Types.Mixed, default: null },
        agentTokens: { type: Schema.Types.Mixed, default: null },
        memoryContext: { type: Schema.Types.Mixed, default: null },
        appToken: { type: Schema.Types.Mixed, default: null },
        universeLayout: { type: Schema.Types.Mixed, default: null },
    },
    { collection: "engramind_state", versionKey: false },
)

const contextCacheSchema = new Schema<IEngramindContextCache>(
    {
        _id: { type: String, required: true },
        consumer: { type: String, required: true },
        channels: { type: [String], default: [] },
        content: { type: String, default: "" },
        version: { type: String, default: "" },
        counts: { type: Schema.Types.Mixed, default: () => ({ full: 0, titles: 0, overflow: 0 }) },
        format: { type: String, default: "markdown" },
        memoryIds: { type: [String], default: [] },
        delivered: { type: [String], default: [] },
        titleIds: { type: [String], default: [] },
        focusHash: { type: String, default: null },
        focusMode: { type: String, default: null },
        fetchedAt: { type: Date, required: true },
    },
    { collection: "engramind_context_cache", versionKey: false },
)

const deliverySchema = new Schema<IEngramindDelivery>(
    {
        _id: { type: String, required: true },
        fullIds: { type: [String], default: [] },
        titleIds: { type: [String], default: [] },
        overflow: { type: Number, default: 0 },
        counts: { type: Schema.Types.Mixed, default: () => ({ full: 0, titles: 0, overflow: 0 }) },
        channels: { type: [String], default: [] },
        delivered: { type: [String], default: [] },
        version: { type: String, default: "" },
        focusMode: { type: String, default: null },
        source: { type: String, default: "live" },
        at: { type: Date, required: true },
    },
    { collection: "engramind_deliveries", versionKey: false },
)

export const EngramindDelivery: Model<IEngramindDelivery> = (models.EngramindDelivery as Model<IEngramindDelivery>) ?? model<IEngramindDelivery>("EngramindDelivery", deliverySchema)

export const EngramindContextCache: Model<IEngramindContextCache> =
    (models.EngramindContextCache as Model<IEngramindContextCache>) ?? model<IEngramindContextCache>("EngramindContextCache", contextCacheSchema)
export const EngramindWebhookEvent: Model<IEngramindWebhookEvent> =
    (models.EngramindWebhookEvent as Model<IEngramindWebhookEvent>) ?? model<IEngramindWebhookEvent>("EngramindWebhookEvent", webhookEventSchema)
export const EngramindState: Model<IEngramindState> = (models.EngramindState as Model<IEngramindState>) ?? model<IEngramindState>("EngramindState", stateSchema)

export const ENGRAMIND_STATE_ID = "engramind"

let indexesReady: Promise<void> | null = null

export async function engramindDb(): Promise<void> {
    await dbConnect()
    indexesReady ??= Promise.all([EngramindWebhookEvent.createIndexes(), EngramindState.createIndexes()])
        .then(() => undefined)
        .catch((error: unknown) => {
            indexesReady = null
            throw error
        })
    await indexesReady
}
