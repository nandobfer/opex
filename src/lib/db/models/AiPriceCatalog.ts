import { Schema, model, models, type Model } from "mongoose"

/**
 * Último catálogo de preços bom de cada fonte (OPE-203): `models.dev` e `command-code`. Só os preços usados;
 * é a cópia que vale quando a fonte não responde (inclusive depois de um reinício).
 */
export interface IAiPriceCatalog {
    source: string
    data: unknown
    fetchedAt: Date
}

const AiPriceCatalogSchema = new Schema<IAiPriceCatalog>(
    {
        source: { type: String, required: true, unique: true },
        data: { type: Schema.Types.Mixed, default: null },
        fetchedAt: { type: Date, default: () => new Date() },
    },
    { collection: "ai_price_catalogs", versionKey: false, minimize: false },
)

if (process.env.NODE_ENV === "development") {
    delete models.AiPriceCatalog
}

export const AiPriceCatalog: Model<IAiPriceCatalog> = (models.AiPriceCatalog as Model<IAiPriceCatalog>) || model<IAiPriceCatalog>("AiPriceCatalog", AiPriceCatalogSchema)
