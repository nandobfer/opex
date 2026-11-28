import type { CSSProperties } from "react"
import { normalizeColor } from "@/lib/colors"

/**
 * Cores dos grupos do catálogo (módulo puro): o hex é dado do dono (seletor de cores do Opex), aplicado
 * por `style` como as cores das centrais; sem cor válida, ficam as classes neutras do tema.
 */
export const NEUTRAL_TECH_CHIP_CLASS = "border-border bg-muted text-foreground"

export function techChipProps(color: string | null | undefined): { className?: string; style?: CSSProperties } {
    const hex = normalizeColor(color)
    return hex ? { style: { color: hex, borderColor: `${hex}66`, backgroundColor: `${hex}1F` } } : { className: NEUTRAL_TECH_CHIP_CLASS }
}

export function techDividerStyle(color: string | null | undefined): CSSProperties | undefined {
    const hex = normalizeColor(color)
    return hex ? { backgroundImage: `linear-gradient(to right, ${hex}99, transparent)` } : undefined
}

export function techDotStyle(color: string | null | undefined): CSSProperties | undefined {
    const hex = normalizeColor(color)
    return hex ? { backgroundColor: hex } : undefined
}
