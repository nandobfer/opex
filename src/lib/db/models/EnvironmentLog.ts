import { Schema, model, models, type Document, type Model } from "mongoose"

/** Retenção dos logs dos ambientes (mesma política do console de integrações). */
export const ENVIRONMENT_LOG_TTL_SECONDS = 48 * 60 * 60

export type EnvironmentLogLevel = "info" | "step" | "success" | "warn" | "error"

export interface IEnvironmentLog extends Document {
    environmentId: string
    level: EnvironmentLogLevel
    message: string
    data?: unknown
    /** Serviço do compose (`null` = todos). */
    service?: string | null
    /** Origem da linha (`publish`, `restore`, `logs`...). */
    scope?: string
    ts: Date
    instance?: string
}

const EnvironmentLogSchema = new Schema(
    {
        environmentId: { type: String, required: true },
        level: { type: String, required: true },
        message: { type: String, required: true },
        data: { type: Schema.Types.Mixed },
        service: { type: String, default: null },
        scope: { type: String },
        ts: { type: Date, required: true, default: Date.now },
        instance: { type: String },
    },
    { collection: "environment_logs", versionKey: false },
)

EnvironmentLogSchema.index({ ts: 1 }, { expireAfterSeconds: ENVIRONMENT_LOG_TTL_SECONDS })
EnvironmentLogSchema.index({ environmentId: 1, ts: -1 })

if (process.env.NODE_ENV === "development") {
    delete models.EnvironmentLog
}

export const EnvironmentLog: Model<IEnvironmentLog> =
    (models.EnvironmentLog as Model<IEnvironmentLog>) || model<IEnvironmentLog>("EnvironmentLog", EnvironmentLogSchema)

export default EnvironmentLog
