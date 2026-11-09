"use client"

import { motion, useReducedMotion } from "framer-motion"
import { Star } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export const FAVORITE_MODEL_LABEL = "Favoritar modelo"
export const UNFAVORITE_MODEL_LABEL = "Remover dos favoritos"

/**
 * Estrela de favorito de uma opção de modelo. O clique do mouse não tira o foco da busca (↑/↓ seguem
 * funcionando); pelo teclado, Tab chega na estrela e Espaço/Enter alterna.
 */
export function ModelFavoriteButton({ favorite, onToggle }: { favorite: boolean; onToggle: () => void }) {
    const reduce = useReducedMotion()
    const label = favorite ? UNFAVORITE_MODEL_LABEL : FAVORITE_MODEL_LABEL
    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        aria-label={label}
                        aria-pressed={favorite}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                            event.stopPropagation()
                            onToggle()
                        }}
                        className="flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        <motion.span key={favorite ? "on" : "off"} initial={reduce ? false : { scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="flex">
                            <Star aria-hidden className={cn("size-4", favorite && "fill-primary text-primary")} />
                        </motion.span>
                    </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
