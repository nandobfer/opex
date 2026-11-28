import { Schema, model, models, type Model } from "mongoose"

/**
 * Inteligência Artificial:
 * - `ai_feature_settings`: configuração de cada feature que usa IA (provedor, modelo, prompt…),
 *   validada pelo schema Zod da feature;
 *
 * O `ai_usage_logs` (uma linha por geração) é da central de integrações (`@nandobfer/integracoes`,
 * subpath `/ia`): `AiUsageLog` vem de `@nandobfer/integracoes/modules/integrations/ia/models/AiUsageLog`.
 */

export interface IAiFeatureSetting {
    feature: string
    settings: Record<string, unknown>
    updatedAt: Date
    updatedBy: string
}

const AiFeatureSettingSchema = new Schema<IAiFeatureSetting>(
    {
        feature: { type: String, required: true, unique: true },
        settings: { type: Schema.Types.Mixed, default: {} },
        updatedAt: { type: Date, default: () => new Date() },
        updatedBy: { type: String, required: true },
    },
    { collection: "ai_feature_settings", versionKey: false, minimize: false },
)

if (process.env.NODE_ENV === "development") {
    delete models.AiFeatureSetting
}

export const AiFeatureSetting: Model<IAiFeatureSetting> =
    (models.AiFeatureSetting as Model<IAiFeatureSetting>) || model<IAiFeatureSetting>("AiFeatureSetting", AiFeatureSettingSchema)
