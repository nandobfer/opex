import type { CSSProperties } from "react"
import type { BackgroundVariant } from "@xyflow/react"

/**
 * Tema compartilhado dos canvas React Flow do app (rede do Engramind, diagramas do Agente Arquiteto).
 *
 * O fundo segue o padrão das páginas (`bg-background`) com um brilho violeta bem suave no centro; o
 * React Flow fica transparente. O `colorMode="dark"` da biblioteca pinta o canvas, o minimapa e os
 * controles de cinza neutro fixo por uma folha de estilo fora das camadas do Tailwind: as variáveis no
 * `style` do próprio elemento (`FLOW_THEME_STYLE`) vencem essa folha. Os tipos de nó reservados da
 * biblioteca (`group`, `default`, `input`, `output`) ganham classe com fundo, padding e borda próprios:
 * os canvas usam tipos com prefixo do domínio, e as variáveis abaixo neutralizam o que sobrar.
 */
export const FLOW_SURFACE_CLASS = "relative overflow-hidden rounded-xl border bg-background bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.08),transparent_70%)]"

export const FLOW_THEME_STYLE = {
    "--xy-background-color": "transparent",
    "--xy-background-pattern-color": "hsl(var(--muted-foreground) / 0.18)",
    "--xy-edge-stroke": "hsl(var(--border))",
    "--xy-node-background-color": "transparent",
    "--xy-node-border": "0",
    "--xy-node-color": "hsl(var(--foreground))",
    "--xy-node-group-background-color": "transparent",
    "--xy-node-border-radius": "var(--radius)",
    "--xy-node-boxshadow-hover": "none",
    "--xy-node-boxshadow-selected": "0 0 0 1px hsl(var(--primary) / 0.6)",
    "--xy-minimap-background-color": "hsl(var(--card) / 0.9)",
    "--xy-minimap-mask-background-color": "hsl(var(--background) / 0.6)",
    "--xy-minimap-mask-stroke-color": "hsl(var(--primary) / 0.4)",
    "--xy-minimap-node-background-color": "hsl(var(--primary) / 0.5)",
    "--xy-minimap-node-stroke-color": "transparent",
    "--xy-controls-button-background-color": "hsl(var(--card) / 0.9)",
    "--xy-controls-button-background-color-hover": "hsl(var(--primary) / 0.15)",
    "--xy-controls-button-color": "hsl(var(--foreground))",
    "--xy-controls-button-color-hover": "hsl(var(--foreground))",
    "--xy-controls-button-border-color": "hsl(var(--border))",
    "--xy-controls-box-shadow": "none",
    "--xy-attribution-background-color": "transparent",
} as CSSProperties

/** Pontos discretos do fundo (`<Background {...FLOW_BACKGROUND_PROPS} />`). */
export const FLOW_BACKGROUND_PROPS = { variant: "dots" as BackgroundVariant, gap: 28, size: 1 }
