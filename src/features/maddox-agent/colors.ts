import type { CSSProperties } from "react"
import type { ColumnColor } from "@/features/tasks/board"

/**
 * Cor de um agente de chat (módulo PURO). A cor vem da paleta das colunas (`null` = primária do tema)
 * e é aplicada sobrescrevendo `--primary`/`--primary-foreground` no contêiner do agente: as classes
 * `bg-primary`, `text-primary`, `ring-primary`… de dentro passam a usar a cor do agente sem mudar o
 * markup (o tema expõe `--color-primary: hsl(var(--primary))` em `@theme inline`).
 *
 * O texto sobre a cor é escolhido pelo contraste (WCAG): branco ou quase preto, o que der a maior
 * razão de contraste — cores claras (âmbar, lima, ciano) ficam com texto escuro.
 */

/** Tom 500 da paleta do Tailwind (o mesmo das bolinhas do seletor). */
export const AGENT_COLOR_HEX: Record<ColumnColor, string> = {
    violet: "#8b5cf6",
    sky: "#0ea5e9",
    emerald: "#10b981",
    amber: "#f59e0b",
    rose: "#f43f5e",
    cyan: "#06b6d4",
    orange: "#f97316",
    pink: "#ec4899",
    lime: "#84cc16",
    zinc: "#71717a",
}

const LIGHT_TEXT = "#ffffff"
const DARK_TEXT = "#09090b"

function rgbOf(hex: string): [number, number, number] {
    const value = hex.replace("#", "")
    return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16)) as [number, number, number]
}

/** Luminância relativa (WCAG 2.1). */
export function relativeLuminance(hex: string): number {
    const [r, g, b] = rgbOf(hex).map((channel) => {
        const c = channel / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
    const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
    return (light + 0.05) / (dark + 0.05)
}

/** Texto legível sobre a cor (o de maior contraste entre branco e quase preto). */
export function readableForeground(hex: string): string {
    return contrastRatio(hex, LIGHT_TEXT) >= contrastRatio(hex, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
}

/** `#rrggbb` → `H S% L%` (formato das variáveis do tema). */
export function hexToHslTriplet(hex: string): string {
    const [r, g, b] = rgbOf(hex).map((channel) => channel / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    let h = 0
    let s = 0
    if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
        else if (max === g) h = (b - r) / d + 2
        else h = (r - g) / d + 4
        h *= 60
    }
    return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/**
 * Variáveis do tema para o contêiner do agente. `null` (primária) devolve `{}`: o contêiner herda a
 * primária do tema.
 */
export function agentColorStyle(color: ColumnColor | null | undefined): CSSProperties {
    if (!color) return {}
    const hex = AGENT_COLOR_HEX[color]
    return { "--primary": hexToHslTriplet(hex), "--primary-foreground": hexToHslTriplet(readableForeground(hex)), "--ring": hexToHslTriplet(hex) } as CSSProperties
}
