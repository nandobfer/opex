"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Ban, Check, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { COLOR_MATRIX, COLOR_MATRIX_COLUMNS } from "@/lib/colors"
import { cn } from "@/lib/utils"
import { ColorSwatch } from "./ColorSwatch"
import { HexColorInput } from "./HexColorInput"
import { LowContrastWarning } from "./LowContrastWarning"
import type { FavoriteColor } from "./types"

export interface ColorPickerPanelProps {
    id: string
    value: string | null
    onChange: (color: string | null) => void
    favorites: readonly FavoriteColor[]
    /** Sem callback, o botão "Adicionar às favoritas" não aparece. */
    onAddFavorite?: (color: string) => void
    allowNone?: boolean
    noneLabel?: string
}

export const favoriteLabel = (favorite: FavoriteColor): string => favorite.name || favorite.color

/** Conteúdo do seletor: favoritas, grade padrão (matizes × tons), campo hex e "Adicionar às favoritas". */
export function ColorPickerPanel({ id, value, onChange, favorites, onAddFavorite, allowNone, noneLabel = "Sem cor" }: ColorPickerPanelProps) {
    const isFavorite = Boolean(value) && favorites.some((item) => item.color === value)
    return (
        <div className="space-y-3">
            <section className="space-y-1.5">
                <p id={`${id}-favorites`} className="text-xs font-semibold">
                    Favoritas
                </p>
                <div role="radiogroup" aria-labelledby={`${id}-favorites`} className="flex flex-wrap gap-1">
                    {allowNone && (
                        <motion.button
                            type="button"
                            role="radio"
                            aria-checked={value === null}
                            aria-label={noneLabel}
                            title={noneLabel}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => onChange(null)}
                            className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-md border border-border bg-muted ring-offset-2 ring-offset-popover transition-shadow",
                                value === null && "ring-2 ring-foreground",
                            )}
                        >
                            {value === null ? <Check className="h-3.5 w-3.5 text-foreground" aria-hidden /> : <Ban className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                        </motion.button>
                    )}
                    <AnimatePresence initial={false}>
                        {favorites.map((favorite) => (
                            <motion.span key={favorite.color} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.15 }}>
                                <ColorSwatch color={favorite.color} label={favoriteLabel(favorite)} checked={value === favorite.color} onSelect={onChange} />
                            </motion.span>
                        ))}
                    </AnimatePresence>
                </div>
                {favorites.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma favorita ainda: escolha uma cor e adicione.</p>}
            </section>

            <section className="space-y-1.5">
                <p id={`${id}-matrix`} className="text-xs font-semibold">
                    Paleta
                </p>
                <div role="radiogroup" aria-labelledby={`${id}-matrix`} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLOR_MATRIX_COLUMNS}, minmax(0, 1fr))` }}>
                    {COLOR_MATRIX.flat().map((swatch) => (
                        <ColorSwatch key={swatch.color} color={swatch.color} label={swatch.name} checked={value === swatch.color} onSelect={onChange} />
                    ))}
                </div>
            </section>

            <HexColorInput id={`${id}-hex`} value={value} onChange={onChange} />
            <LowContrastWarning color={value} />

            {onAddFavorite && (
                <Button type="button" variant="outline" size="sm" className="w-full bg-transparent" disabled={!value || isFavorite} onClick={() => value && onAddFavorite(value)}>
                    <Star className="h-3.5 w-3.5" aria-hidden />
                    {isFavorite ? "Já está nas favoritas" : "Adicionar às favoritas"}
                </Button>
            )}
        </div>
    )
}
