import { z } from "zod"
import { MODEL_FAVORITE_ID_MAX, MODEL_FAVORITE_PROVIDERS } from "./constants"

/**
 * Favorito = provedor + id do modelo, em campos separados: o mesmo id pode existir em provedores
 * diferentes (`gemini-2.5-flash` direto x `google/gemini-2.5-flash` no OpenCode) e os ids do OpenCode
 * têm `/` e `:`, então não há separador seguro para uma chave única em texto.
 */
export const modelFavoriteSchema = z.object({
    provider: z.enum(MODEL_FAVORITE_PROVIDERS, { error: "Provedor inválido" }),
    model: z.string().trim().min(1, "Informe o modelo").max(MODEL_FAVORITE_ID_MAX, `Até ${MODEL_FAVORITE_ID_MAX} caracteres`),
})
export type ModelFavoriteInput = z.input<typeof modelFavoriteSchema>
export type ModelFavoriteProvider = (typeof MODEL_FAVORITE_PROVIDERS)[number]

export interface ModelFavoriteDto {
    provider: string
    model: string
}

export interface ModelFavoritesDto {
    favorites: ModelFavoriteDto[]
}
