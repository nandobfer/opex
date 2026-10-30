import { Schema, model, models, type Model, type Types } from "mongoose"
import type { OpexJobStatus, OpexJobUnit, OpexJobWhen } from "@/features/opex-agent/jobs"
import type { OpexMcpToolInfo, OpexMcpTransport } from "@/features/opex-agent/mcp"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"
import type { OpexConfirmationStatus, OpexMessageStatus, OpexPart, OpexSessionStatus, OpexUsageDto } from "@/features/opex-agent/types"

/**
 * Coleções do Agente Opex (`opex_sessions`, `opex_messages`, `opex_pending_actions`, `opex_files`, `opex_jobs`
 * e `opex_mcp_servers`).
 * Ver `aicontext/modules/opex-agent.md`. Os índices são garantidos pela migração
 * `ensure-opex-indexes`.
 */

/** Agente dono de uma sessão (as coleções `opex_*` guardam os dois). */
export type OpexAgentKind = "opex" | "maddox"

/** Pedido do OpenCode em aberto numa sessão do Agente Maddox. */
export interface IMaddoxPendingRequest {
    /** Id do pedido no OpenCode (permissão ou formulário). */
    id: string
    kind: "permission" | "form"
    /** Card da ferramenta (ou parte do formulário) na resposta em andamento. */
    partId: string
    createdAt: Date
}

export interface IOpexSession {
    title: string
    summary: string
    titleSource: "auto" | "manual"
    status: OpexSessionStatus
    lastError: string | null
    archived: boolean
    messageCount: number
    /** Próximo número de ordem das mensagens. */
    nextSeq: number
    /** Cliente do portal dono da sessão; `null` = sessão do app do dono. */
    clientId: string | null
    /** Usuário dono da sessão (`local` no app do dono; id do usuário no portal). */
    userId: string
    /** Agente da sessão; ausente = Agente Opex (sessões anteriores ao Agente Maddox). */
    agent?: OpexAgentKind
    /** Agente Maddox: sessão do OpenCode que guarda a conversa (criada no primeiro turno). */
    opencodeSessionId?: string | null
    /** Agente Maddox: modelo trocado só nesta sessão (`null` = padrão da configuração). */
    modelOverride?: { model: string; variant: string | null } | null
    /** Agente Maddox: pedidos do OpenCode (permissão/pergunta) aguardando resposta neste turno. */
    pendingRequests?: IMaddoxPendingRequest[]
    lastMessageAt: Date
    createdAt: Date
    updatedAt: Date
}

/** Metadados de um arquivo na mensagem do usuário (o binário fica no Storage S3). */
export interface IOpexFileRef {
    id: string
    name: string
    mediaType: string
    size: number
}

export interface IOpexMessage {
    sessionId: Types.ObjectId
    seq: number
    role: "user" | "assistant"
    kind: "message" | "confirmation" | "job" | "notice"
    /** Mensagem disparada por um job agendado. */
    job?: { id: string; title: string } | null
    text: string
    files: IOpexFileRef[]
    parts: OpexPart[]
    /**
     * Mensagens no formato da AI SDK (`ModelMessage[]`) em JSON, reenviadas como histórico. Texto, não
     * objeto: resultados de ferramenta podem ter chaves que o MongoDB não aceita (`$`, `.`).
     */
    modelMessages: string
    status: OpexMessageStatus
    error: string | null
    usage: OpexUsageDto | null
    durationMs: number | null
    model: string | null
    createdAt: Date
}

/**
 * Arquivo do chat: só metadados. A reserva grava `uploadKey` (chave temporária do PUT assinado);
 * a confirmação confere o objeto e o promove para `key` (`ready: true`). `pending` = ainda não foi
 * numa mensagem; a rotina `opex-files-cleanup` remove os pendentes com mais de 24 h (S3 + registro).
 */
export interface IOpexFile {
    sessionId: Types.ObjectId
    /** Mensagem que usou o arquivo; `null` enquanto pendente. */
    messageId: Types.ObjectId | null
    pending: boolean
    /** Envio confirmado no storage (objeto promovido para `key`). */
    ready: boolean
    name: string
    mediaType: string
    size: number
    key: string
    uploadKey: string
    createdAt: Date
}

export interface IOpexPendingAction {
    sessionId: Types.ObjectId
    messageId: Types.ObjectId | null
    toolCallId: string
    toolName: string
    /** Entrada cifrada (`secretBox`): pode conter segredos; apagada depois da decisão. */
    input: unknown
    summary: string
    status: OpexConfirmationStatus
    /** Resultado da execução confirmada (JSON). */
    result: string | null
    error: string | null
    expiresAt: Date
    decidedAt: Date | null
    createdAt: Date
}

const OpexSessionSchema = new Schema<IOpexSession>(
    {
        title: { type: String, required: true },
        summary: { type: String, default: "" },
        titleSource: { type: String, enum: ["auto", "manual"], default: "auto" },
        status: { type: String, enum: ["idle", "running", "awaiting_confirmation", "error"], default: "idle" },
        lastError: { type: String, default: null },
        archived: { type: Boolean, default: false },
        messageCount: { type: Number, default: 0 },
        nextSeq: { type: Number, default: 1 },
        clientId: { type: String, default: null },
        userId: { type: String, default: "" },
        agent: { type: String, enum: ["opex", "maddox"], default: "opex" },
        opencodeSessionId: { type: String, default: null },
        modelOverride: { type: Schema.Types.Mixed, default: null },
        pendingRequests: { type: Schema.Types.Mixed, default: [] },
        lastMessageAt: { type: Date, default: () => new Date() },
    },
    { collection: "opex_sessions", versionKey: false, timestamps: true },
)
// Sessões do dono (`clientId: null`, inclusive as antigas sem o campo) e as privadas por cliente/usuário.
OpexSessionSchema.index({ clientId: 1, userId: 1, archived: 1, lastMessageAt: -1 })
// Agente Maddox: sessões por agente e a busca pela sessão do OpenCode (servidor MCP do Opex).
OpexSessionSchema.index({ agent: 1, clientId: 1, userId: 1, lastMessageAt: -1 })
OpexSessionSchema.index({ opencodeSessionId: 1 }, { sparse: true })

const OpexMessageSchema = new Schema<IOpexMessage>(
    {
        sessionId: { type: Schema.Types.ObjectId, required: true },
        seq: { type: Number, required: true },
        role: { type: String, enum: ["user", "assistant"], required: true },
        kind: { type: String, enum: ["message", "confirmation", "job", "notice"], default: "message" },
        job: { type: Schema.Types.Mixed, default: undefined },
        text: { type: String, default: "" },
        files: { type: Schema.Types.Mixed, default: [] },
        parts: { type: Schema.Types.Mixed, default: [] },
        modelMessages: { type: String, default: "[]" },
        status: { type: String, enum: ["complete", "interrupted", "error"], default: "complete" },
        error: { type: String, default: null },
        usage: { type: Schema.Types.Mixed, default: null },
        durationMs: { type: Number, default: null },
        model: { type: String, default: null },
    },
    { collection: "opex_messages", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
)
OpexMessageSchema.index({ sessionId: 1, seq: 1 }, { unique: true })

const OpexPendingActionSchema = new Schema<IOpexPendingAction>(
    {
        sessionId: { type: Schema.Types.ObjectId, required: true, index: true },
        messageId: { type: Schema.Types.ObjectId, default: null },
        toolCallId: { type: String, required: true },
        toolName: { type: String, required: true },
        input: { type: Schema.Types.Mixed, default: null },
        summary: { type: String, required: true },
        status: { type: String, enum: ["pending", "confirmed", "cancelled", "failed", "expired"], default: "pending" },
        result: { type: String, default: null },
        error: { type: String, default: null },
        expiresAt: { type: Date, required: true },
        decidedAt: { type: Date, default: null },
    },
    { collection: "opex_pending_actions", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
)

const OpexFileSchema = new Schema<IOpexFile>(
    {
        sessionId: { type: Schema.Types.ObjectId, required: true, index: true },
        messageId: { type: Schema.Types.ObjectId, default: null },
        pending: { type: Boolean, default: true },
        ready: { type: Boolean, default: false },
        name: { type: String, required: true },
        mediaType: { type: String, required: true },
        size: { type: Number, required: true },
        key: { type: String, required: true },
        uploadKey: { type: String, required: true },
    },
    { collection: "opex_files", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
)
OpexFileSchema.index({ pending: 1, createdAt: 1 })

/**
 * Job (prompt agendado do agente) — `opex_jobs`. `clientId`/`userId` seguem a sessão: `null` = job do
 * dono; preenchidos = job de um usuário do portal. Terminado, sai pelo TTL de `purgeAt`.
 */
export interface IOpexJob {
    _id: Types.ObjectId
    title: string
    prompt: string
    sessionId: Types.ObjectId | null
    resultSessionId: Types.ObjectId | null
    schedule: { when: OpexJobWhen; amount: number | null; unit: OpexJobUnit | null; date: string | null; time: string | null }
    runAt: Date
    status: OpexJobStatus
    startedAt: Date | null
    finishedAt: Date | null
    delayMs: number | null
    error: string | null
    createdBy: "user" | "agent"
    originSessionId: Types.ObjectId | null
    sourceJobId: Types.ObjectId | null
    /** Cliente do portal dono do job; `null` = job do dono. */
    clientId: string | null
    /** Usuário dono do job (`local` no app do dono; id do usuário no portal). */
    userId: string
    purgeAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const OpexJobSchema = new Schema<IOpexJob>(
    {
        title: { type: String, required: true },
        prompt: { type: String, required: true },
        sessionId: { type: Schema.Types.ObjectId, default: null },
        resultSessionId: { type: Schema.Types.ObjectId, default: null },
        schedule: { type: Schema.Types.Mixed, required: true },
        runAt: { type: Date, required: true },
        status: { type: String, enum: ["scheduled", "running", "done", "error", "awaiting_confirmation", "canceled"], default: "scheduled" },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
        delayMs: { type: Number, default: null },
        error: { type: String, default: null },
        createdBy: { type: String, enum: ["user", "agent"], default: "user" },
        originSessionId: { type: Schema.Types.ObjectId, default: null },
        sourceJobId: { type: Schema.Types.ObjectId, default: null },
        clientId: { type: String, default: null },
        userId: { type: String, default: "" },
        purgeAt: { type: Date, default: null },
    },
    { collection: "opex_jobs", versionKey: false, timestamps: true },
)
OpexJobSchema.index({ status: 1, runAt: 1 })
OpexJobSchema.index({ createdAt: -1 })
OpexJobSchema.index({ clientId: 1, userId: 1, runAt: -1 })
OpexJobSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, name: "purge_ttl" })

/** Header (HTTP/SSE) ou variável de ambiente (stdio) de um MCP: valor cifrado com `secretBox`. */
export interface IOpexMcpSecret {
    key: string
    value: EncryptedSecret
}

/** MCP (servidor Model Context Protocol) usado pelo Agente Opex. */
export interface IOpexMcpServer {
    name: string
    /** Identificador único usado no nome das ferramentas (`mcp_{slug}_{ferramenta}`). */
    slug: string
    description: string
    enabled: boolean
    transport: OpexMcpTransport
    url: string
    command: string
    args: string[]
    headers: IOpexMcpSecret[]
    env: IOpexMcpSecret[]
    /** "Pede confirmação" por ferramenta (nome original); ausente = padrão pela anotação. */
    confirmations: Record<string, boolean>
    tools: OpexMcpToolInfo[]
    toolsSyncedAt: Date | null
    lastError: string | null
    lastCheckedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const OpexMcpSecretSchema = new Schema<IOpexMcpSecret>({ key: { type: String, required: true }, value: { type: Schema.Types.Mixed, required: true } }, { _id: false })

const OpexMcpServerSchema = new Schema<IOpexMcpServer>(
    {
        name: { type: String, required: true },
        slug: { type: String, required: true },
        description: { type: String, default: "" },
        enabled: { type: Boolean, default: true },
        transport: { type: String, required: true },
        url: { type: String, default: "" },
        command: { type: String, default: "" },
        args: { type: [String], default: [] },
        headers: { type: [OpexMcpSecretSchema], default: [] },
        env: { type: [OpexMcpSecretSchema], default: [] },
        confirmations: { type: Schema.Types.Mixed, default: {} },
        tools: { type: Schema.Types.Mixed, default: [] },
        toolsSyncedAt: { type: Date, default: null },
        lastError: { type: String, default: null },
        lastCheckedAt: { type: Date, default: null },
    },
    { collection: "opex_mcp_servers", versionKey: false, timestamps: true, minimize: false },
)
OpexMcpServerSchema.index({ slug: 1 }, { unique: true })

if (process.env.NODE_ENV === "development") {
    delete models.OpexMcpServer
    delete models.OpexJob
    delete models.OpexFile
    delete models.OpexSession
    delete models.OpexMessage
    delete models.OpexPendingAction
}

export const OpexSession: Model<IOpexSession> = (models.OpexSession as Model<IOpexSession>) || model<IOpexSession>("OpexSession", OpexSessionSchema)
export const OpexMessage: Model<IOpexMessage> = (models.OpexMessage as Model<IOpexMessage>) || model<IOpexMessage>("OpexMessage", OpexMessageSchema)
export const OpexFile: Model<IOpexFile> = (models.OpexFile as Model<IOpexFile>) || model<IOpexFile>("OpexFile", OpexFileSchema)
export const OpexJob: Model<IOpexJob> = (models.OpexJob as Model<IOpexJob>) || model<IOpexJob>("OpexJob", OpexJobSchema)
export const OpexPendingAction: Model<IOpexPendingAction> =
    (models.OpexPendingAction as Model<IOpexPendingAction>) || model<IOpexPendingAction>("OpexPendingAction", OpexPendingActionSchema)
export const OpexMcpServer: Model<IOpexMcpServer> = (models.OpexMcpServer as Model<IOpexMcpServer>) || model<IOpexMcpServer>("OpexMcpServer", OpexMcpServerSchema)
