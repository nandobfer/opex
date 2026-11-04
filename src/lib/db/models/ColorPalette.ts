import { Schema, model, models, type Model } from "mongoose"

/**
 * Cores favoritas do seletor de cores (`color_palettes`), compartilhadas por todos os seletores do
 * app. Um único documento (`key: "favorites"`); sem documento, valem as favoritas padrão.
 */
export interface IColorPalette {
    key: string
    colors: { color: string; name: string | null }[]
}

const ColorPaletteSchema = new Schema<IColorPalette>(
    {
        key: { type: String, required: true, unique: true },
        colors: { type: [{ _id: false, color: { type: String, required: true }, name: { type: String, default: null } }], default: [] },
    },
    { collection: "color_palettes", versionKey: false, timestamps: true },
)

if (process.env.NODE_ENV === "development") {
    delete models.ColorPalette
}

export const ColorPalette: Model<IColorPalette> = (models.ColorPalette as Model<IColorPalette>) || model<IColorPalette>("ColorPalette", ColorPaletteSchema)
