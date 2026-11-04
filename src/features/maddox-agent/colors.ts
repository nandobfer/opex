import type { CSSProperties } from "react"
import { hexToHslTriplet, normalizeColor, readableTextOn } from "@/lib/colors"

/**
 * Cor de um agente de chat (módulo PURO). A cor é um hex `#RRGGBB` escolhido pelo usuário (`null` =
 * primária do tema) e é aplicada sobrescrevendo `--primary`/`--primary-foreground`/`--ring` no contêiner
 * do agente com o triplet HSL calculado em tempo de execução: as classes `bg-primary`, `text-primary`,
 * `ring-primary`… de dentro passam a usar a cor do agente sem mudar o markup. O texto sobre a cor fica
 * claro ou escuro conforme a luminância (`readableTextOn`), para continuar legível.
 */

const DARK_TEXT = "240 10% 4%"
const LIGHT_TEXT = "0 0% 100%"

/**
 * Cor padrão (`null`) também é aplicada explicitamente, com a primária original guardada em `:root`
 * (`--agent-primary`… em `globals.css`): um contêiner sem estilo herdaria o `--primary` de um agente de
 * outra cor em volta (ex.: o botão do Opex dentro do popover do Maddox).
 */
export function agentColorStyle(color: string | null | undefined): CSSProperties {
    const hex = normalizeColor(color)
    if (!hex) return { "--primary": "var(--agent-primary)", "--primary-foreground": "var(--agent-primary-foreground)", "--ring": "var(--agent-ring)" } as CSSProperties
    const triplet = hexToHslTriplet(hex)
    return { "--primary": triplet, "--primary-foreground": readableTextOn(hex) === "dark" ? DARK_TEXT : LIGHT_TEXT, "--ring": triplet } as CSSProperties
}
