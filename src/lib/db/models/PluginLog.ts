import { Schema, model, models, type Document, type Model } from "mongoose"
import type { IntegrationLogLevel } from "@/lib/integrations/log-format"

/** Retenção dos logs de debug dos plugins (OPE-172), igual à das integrações. */
export const PLUGIN_LOG_TTL_SECONDS = 48 * 60 * 60

export interface IPluginLog extends Document {
    pluginId: string
    channel: "stable" | "preview" | null
    level: IntegrationLogLevel
    message: string
    data?: unknown
    ts: Date
    instance?: string
}

const PluginLogSchema = new Schema(
    {
        pluginId: { type: String, required: true },
        channel: { type: String, default: null },
        level: { type: String, required: true },
        message: { type: String, required: true },
        data: { type: Schema.Types.Mixed },
        ts: { type: Date, required: true, default: Date.now },
        instance: { type: String },
    },
    { collection: "plugin_logs", versionKey: false },
)

PluginLogSchema.index({ ts: 1 }, { expireAfterSeconds: PLUGIN_LOG_TTL_SECONDS })
PluginLogSchema.index({ pluginId: 1, ts: -1 })

if (process.env.NODE_ENV === "development") {
    delete models.PluginLog
}

export const PluginLog: Model<IPluginLog> = (models.PluginLog as Model<IPluginLog>) || model<IPluginLog>("PluginLog", PluginLogSchema)
