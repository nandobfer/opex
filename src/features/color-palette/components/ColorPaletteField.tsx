"use client"

import { ColorPicker } from "@/components/ui/color-picker"
import { useColorPalette } from "../hooks"

interface ColorPaletteFieldProps {
    id: string
    value: string | null
    onChange: (color: string | null) => void
    /** Oferece "Sem cor" (`null`). */
    allowNone?: boolean
    noneLabel?: string
    disabled?: boolean
    "aria-labelledby"?: string
}

/**
 * Seletor de cores ligado às favoritas compartilhadas do app (`useColorPalette`). É o ponto de uso
 * nas telas: a favorita adicionada aqui aparece em todos os outros seletores.
 */
export function ColorPaletteField(props: ColorPaletteFieldProps) {
    const palette = useColorPalette()
    return <ColorPicker {...props} favorites={palette.favorites} onAddFavorite={(color) => palette.addFavorite({ color })} />
}
