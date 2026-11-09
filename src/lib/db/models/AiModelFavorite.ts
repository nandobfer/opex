import { Schema, model, models, type Model } from "mongoose"

/**
 * Modelos de IA favoritos de um usuário do app (`ai_model_favorites`): a estrela das buscas de modelo.
 * A chave é o par `provider` + `model` (ids de provedores diferentes podem coincidir), único por usuário.
 */
export interface IAiModelFavorite {
    userId: string
    provider: string
    model: string
    createdAt: Date
}

const AiModelFavoriteSchema = new Schema<IAiModelFavorite>(
    {
        userId: { type: String, required: true },
        provider: { type: String, required: true },
        model: { type: String, required: true },
        createdAt: { type: Date, default: () => new Date() },
    },
    { collection: "ai_model_favorites", versionKey: false },
)

AiModelFavoriteSchema.index({ userId: 1, provider: 1, model: 1 }, { unique: true })

if (process.env.NODE_ENV === "development") {
    delete models.AiModelFavorite
}

export const AiModelFavorite: Model<IAiModelFavorite> = (models.AiModelFavorite as Model<IAiModelFavorite>) || model<IAiModelFavorite>("AiModelFavorite", AiModelFavoriteSchema)
