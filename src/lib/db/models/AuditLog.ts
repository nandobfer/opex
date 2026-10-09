import mongoose, { Schema, type Model } from "mongoose"

/**
 * Trilha de auditoria (coleção capped, como no Smart Desk).
 *
 * App de uso pessoal, sem login: `userId` é o dono local (`LOCAL_USER.id`) ou `system` para
 * rotinas e migrações.
 */

export const ACOES_AUDITORIA = [
    "LOGIN",
    "LOGOUT",
    "CRIAR",
    "ATUALIZAR",
    "EXCLUIR",
    "MOVER",
    "ATRIBUIR",
    "APROVAR",
    "DEVOLVER",
    "ABORTAR",
    "IMPORTAR",
    "OPT_OUT",
    "EXECUTAR",
] as const

export type AcaoAuditoria = (typeof ACOES_AUDITORIA)[number]

export interface IAuditLog {
    userId: string
    entidade: string
    entidadeId: string
    acao: AcaoAuditoria
    timestamp: Date
    dadosAnteriores?: Record<string, unknown>
    dadosNovos?: Record<string, unknown>
    ipAddress?: string
    userAgent?: string
}

const AuditLogSchema = new Schema<IAuditLog>(
    {
        userId: { type: String, required: true },
        entidade: { type: String, required: true },
        entidadeId: { type: String, required: true },
        acao: { type: String, enum: ACOES_AUDITORIA, required: true },
        timestamp: { type: Date, default: Date.now },
        dadosAnteriores: { type: Schema.Types.Mixed },
        dadosNovos: { type: Schema.Types.Mixed },
        ipAddress: { type: String },
        userAgent: { type: String },
    },
    {
        capped: { size: 100 * 1024 * 1024, max: 500_000 },
        timestamps: false,
        collection: "audit_logs",
    },
)

AuditLogSchema.index({ timestamp: -1 })
AuditLogSchema.index({ entidade: 1, entidadeId: 1, timestamp: -1 })
AuditLogSchema.index({ userId: 1, timestamp: -1 })

export const AuditLog: Model<IAuditLog> =
    (mongoose.models.AuditLog as Model<IAuditLog>) || mongoose.model<IAuditLog>("AuditLog", AuditLogSchema)
