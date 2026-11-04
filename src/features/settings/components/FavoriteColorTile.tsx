"use client"

import { motion } from "framer-motion"
import { Pencil, TriangleAlert, X } from "lucide-react"
import { hasLowContrast } from "@/lib/colors"
import type { FavoriteColorDto } from "@/features/color-palette/schemas"
import { FAVORITE_SWATCH, FAVORITE_TILE } from "./settings-layout"

const TILE_ACTION = "rounded-md p-1 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Cartão de uma cor favorita: amostra, nome, hex, aviso de contraste, editar e remover. */
export function FavoriteColorTile({ favorite, onEdit, onRemove }: { favorite: FavoriteColorDto; onEdit: () => void; onRemove: () => void }) {
    const label = favorite.name || favorite.color
    return (
        <motion.li
            layout="position"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className={FAVORITE_TILE}
            data-testid="favorite-color"
        >
            <span className={FAVORITE_SWATCH} style={{ backgroundColor: favorite.color }} aria-hidden />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{label}</span>
                <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                    {favorite.color}
                    {hasLowContrast(favorite.color) && (
                        <TriangleAlert className="h-3 w-3 text-warning" aria-label="Pouco contraste com o tema escuro">
                            <title>Pouco contraste com o tema escuro</title>
                        </TriangleAlert>
                    )}
                </span>
            </span>
            <button type="button" onClick={onEdit} aria-label={`Editar ${label} nas favoritas`} title="Editar favorita" className={`${TILE_ACTION} hover:bg-muted hover:text-foreground`}>
                <Pencil className="h-4 w-4" aria-hidden />
            </button>
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remover ${label} das favoritas`}
                title="Remover das favoritas"
                className={`${TILE_ACTION} hover:bg-destructive/15 hover:text-destructive`}
            >
                <X className="h-4 w-4" aria-hidden />
            </button>
        </motion.li>
    )
}
