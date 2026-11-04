"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { COLOR_MATRIX } from "@/lib/colors"
import { cn } from "@/lib/utils"
import { ColorPickerPanel, favoriteLabel, type ColorPickerPanelProps } from "./ColorPickerPanel"
import { LowContrastWarning } from "./LowContrastWarning"

export interface ColorPickerProps extends ColorPickerPanelProps {
    disabled?: boolean
    "aria-labelledby"?: string
}

/** Nome da cor escolhida: o da favorita, o da grade padrão ou o próprio hex. */
function colorName(value: string, favorites: ColorPickerProps["favorites"]): string {
    const favorite = favorites.find((item) => item.color === value)
    if (favorite) return favoriteLabel(favorite)
    return COLOR_MATRIX.flat().find((item) => item.color === value)?.name ?? value
}

/**
 * Seletor de cores do app: botão com a cor atual que abre a grade (favoritas, paleta padrão e campo
 * hex). Genérico: as favoritas chegam por props; nas telas use o `ColorPaletteField` da feature
 * `color-palette`, que liga o seletor às favoritas compartilhadas.
 */
export function ColorPicker({ id, value, onChange, favorites, disabled, allowNone, noneLabel = "Sem cor", "aria-labelledby": labelledBy, ...panel }: ColorPickerProps) {
    const [open, setOpen] = useState(false)
    return (
        <div className="space-y-1.5">
            {/* `modal`: dentro de Dialog, sem ele o Dialog bloqueia a rolagem e o foco do popover. */}
            <Popover open={open} onOpenChange={setOpen} modal>
                <PopoverTrigger asChild>
                    <button
                        id={id}
                        type="button"
                        disabled={disabled}
                        aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined}
                        className={cn(
                            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                    >
                        <span className={cn("h-5 w-5 shrink-0 rounded", !value && "border border-border bg-muted")} style={value ? { backgroundColor: value } : undefined} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{value ? colorName(value, favorites) : noneLabel}</span>
                        {value && <span className="font-mono text-xs text-muted-foreground">{value}</span>}
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[19.5rem] p-3">
                    <ColorPickerPanel id={id} value={value} onChange={onChange} favorites={favorites} allowNone={allowNone} noneLabel={noneLabel} {...panel} />
                </PopoverContent>
            </Popover>
            <LowContrastWarning color={value} />
        </div>
    )
}
