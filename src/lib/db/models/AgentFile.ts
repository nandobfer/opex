import { Schema, model, models, type Model, type Types } from "mongoose"

/**
 * Catálogo dos arquivos dos agentes (OPE-210, `agent_files`): um documento por arquivo guardado no espaço
 * reservado aos agentes no bucket (`agent-files/<id>/<nome>`). A chave do bucket é gerada pelo servidor e
 * nunca sai no DTO. Ver `aicontext/modules/agent-documents.md`.
 */

export type AgentFileKind = "file" | "pdf" | "resume"
export type AgentFileStatus = "ready" | "pending"
export type AgentFileOriginType = "routine" | "opex" | "maddox" | "api-token" | "app"

export interface IAgentFileOrigin {
    type: AgentFileOriginType
    agentId?: string | null
    agentName?: string | null
    runId?: string | null
    sessionId?: string | null
    tokenId?: string | null
    tool?: string | null
}

export interface IAgentFile {
    _id: Types.ObjectId
    name: string
    mimeType: string
    size: number | null
    pages: number | null
    key: string
    kind: AgentFileKind
    status: AgentFileStatus
    origin: IAgentFileOrigin
    metadata: Map<string, string>
    parentId: Types.ObjectId | null
    pdf?: { format: string; orientation: string; scale: number; fits: boolean; maxPages: number } | null
    resume?: { content: unknown; language: string; density: string; htmlFileId: Types.ObjectId | null; pngFileId: Types.ObjectId | null } | null
    /** Envio por URL (pendente): limite declarado e validade da URL de envio. */
    upload?: { maxBytes: number; expiresAt: Date } | null
    createdAt: Date
    updatedAt: Date
}

const AgentFileOriginSchema = new Schema<IAgentFileOrigin>(
    {
        type: { type: String, enum: ["routine", "opex", "maddox", "api-token", "app"], required: true },
        agentId: { type: String, default: null },
        agentName: { type: String, default: null },
        runId: { type: String, default: null },
        sessionId: { type: String, default: null },
        tokenId: { type: String, default: null },
        tool: { type: String, default: null },
    },
    { _id: false },
)

const AgentFileSchema = new Schema<IAgentFile>(
    {
        name: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, default: null },
        pages: { type: Number, default: null },
        key: { type: String, required: true, unique: true },
        kind: { type: String, enum: ["file", "pdf", "resume"], default: "file" },
        status: { type: String, enum: ["ready", "pending"], default: "ready" },
        origin: { type: AgentFileOriginSchema, required: true },
        metadata: { type: Map, of: String, default: () => new Map() },
        parentId: { type: Schema.Types.ObjectId, default: null },
        pdf: { type: Schema.Types.Mixed, default: null },
        resume: { type: Schema.Types.Mixed, default: null },
        upload: { type: Schema.Types.Mixed, default: null },
    },
    { collection: "agent_files", timestamps: true, versionKey: false },
)

AgentFileSchema.index({ createdAt: -1 })
AgentFileSchema.index({ kind: 1, createdAt: -1 })
AgentFileSchema.index({ "origin.agentId": 1, createdAt: -1 })
AgentFileSchema.index({ "origin.runId": 1 })
AgentFileSchema.index({ "metadata.empresa": 1 })
AgentFileSchema.index({ "metadata.vaga": 1 })
AgentFileSchema.index({ "metadata.jobId": 1 })
AgentFileSchema.index({ parentId: 1 })

if (process.env.NODE_ENV === "development") {
    delete models.AgentFile
}

export const AgentFile: Model<IAgentFile> = (models.AgentFile as Model<IAgentFile>) || model<IAgentFile>("AgentFile", AgentFileSchema)
