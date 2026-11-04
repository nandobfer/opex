import { z } from "zod"
import { hexColorSchema } from "@/lib/colors"
import { COLOR_NAME_MAX } from "./constants"

/** Favorita (`POST` para adicionar, `PATCH /favorites/[hex]` para editar); sem nome, a tela mostra o hex. */
export const favoriteColorSchema = z.object({
    color: hexColorSchema,
    name: z
        .string()
        .trim()
        .max(COLOR_NAME_MAX, `Até ${COLOR_NAME_MAX} caracteres`)
        .nullish()
        .transform((value) => value || null),
})
export type FavoriteColorInput = z.input<typeof favoriteColorSchema>

/** Alias do schema da favorita no fluxo de adicionar. */
export const addFavoriteColorSchema = favoriteColorSchema
export type AddFavoriteColorInput = FavoriteColorInput

export interface FavoriteColorDto {
    color: string
    name: string | null
}

export interface ColorPaletteDto {
    favorites: FavoriteColorDto[]
}
