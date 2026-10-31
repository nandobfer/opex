import type { CSSProperties } from "react"
import type { ColumnColor } from "@/features/tasks/board"

/**
 * Cor de um agente de chat (módulo PURO). A cor vem da paleta das colunas (`null` = primária do tema)
 * e é aplicada sobrescrevendo `--primary`/`--primary-foreground`/`--ring` no contêiner do agente com os
 * tokens do tema (`--agent-{cor}` e `--agent-{cor}-foreground`, em `globals.css`): as classes
 * `bg-primary`, `text-primary`, `ring-primary`… de dentro passam a usar a cor do agente sem mudar o
 * markup. O texto legível sobre cada cor (contraste) é definido no próprio token `-foreground`.
 */

/** Nome do token do tema de uma cor de agente. */
export const agentColorToken = (color: ColumnColor) => `--agent-${color}`

/**
 * Cor padrão (`null`) também é aplicada explicitamente: um contêiner sem estilo herdaria o `--primary`
 * de um agente de outra cor em volta (ex.: o botão do Opex dentro do popover do Maddox).
 */
export function agentColorStyle(color: ColumnColor | null | undefined): CSSProperties {
    if (!color) return { "--primary": "var(--agent-primary)", "--primary-foreground": "var(--agent-primary-foreground)", "--ring": "var(--agent-ring)" } as CSSProperties
    const token = agentColorToken(color)
    return { "--primary": `var(${token})`, "--primary-foreground": `var(${token}-foreground)`, "--ring": `var(${token})` } as CSSProperties
}
