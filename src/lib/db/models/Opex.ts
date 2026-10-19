import { Schema, model, models, type Model, type Types } from "mongoose"
import type { OpexConfirmationStatus, OpexMessageStatus, OpexPart, OpexSessionStatus, OpexUsageDto } from "@/features/opex-agent/types"

/**
 * Coleções do Agente Opex (`opex_sessions`, `opex_messages`, `opex_pending_actions` e `opex_files`).
 * Ver `aicontext/modules/opex-agent.md`. Os índices são garantidos pela migração
 * `ensure-opex-indexes`.
 */

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
    kind: "message" | "confirmation"
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
        lastMessageAt: { type: Date, default: () => new Date() },
    },
    { collection: "opex_sessions", versionKey: false, timestamps: true },
)
OpexSessionSchema.index({ archived: 1, lastMessageAt: -1 })

const OpexMessageSchema = new Schema<IOpexMessage>(
    {
        sessionId: { type: Schema.Types.ObjectId, required: true },
        seq: { type: Number, required: true },
        role: { type: String, enum: ["user", "assistant"], required: true },
        kind: { type: String, enum: ["message", "confirmation"], default: "message" },
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

if (process.env.NODE_ENV === "development") {
    delete models.OpexFile
    delete models.OpexSession
    delete models.OpexMessage
    delete models.OpexPendingAction
}

export const OpexSession: Model<IOpexSession> = (models.OpexSession as Model<IOpexSession>) || model<IOpexSession>("OpexSession", OpexSessionSchema)
export const OpexMessage: Model<IOpexMessage> = (models.OpexMessage as Model<IOpexMessage>) || model<IOpexMessage>("OpexMessage", OpexMessageSchema)
export const OpexFile: Model<IOpexFile> = (models.OpexFile as Model<IOpexFile>) || model<IOpexFile>("OpexFile", OpexFileSchema)
export const OpexPendingAction: Model<IOpexPendingAction> =
    (models.OpexPendingAction as Model<IOpexPendingAction>) || model<IOpexPendingAction>("OpexPendingAction", OpexPendingActionSchema)
