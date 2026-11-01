import type { CSSProperties } from "react"

/** Dimensões compartilhadas pela rede e pelo skeleton (o skeleton acompanha a interface). */

/**
 * Fundo das redes no padrão do app: o fundo das páginas (`bg-background`) com um brilho violeta bem
 * suave no centro. O React Flow fica transparente (`NETWORK_FLOW_THEME`).
 */
export const NETWORK_CANVAS_CLASS = "relative h-[min(72vh,44rem)] w-full overflow-hidden rounded-xl border bg-background bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.08),transparent_70%)]"
/**
 * Tema do React Flow pelos tokens do app: o `colorMode="dark"` da biblioteca pinta o canvas de cinza
 * neutro fixo por uma folha de estilo fora das camadas do Tailwind; variável no próprio elemento vence.
 */
export const NETWORK_FLOW_THEME = {
    "--xy-background-color": "transparent",
    "--xy-background-pattern-color": "hsl(var(--muted-foreground) / 0.18)",
    "--xy-edge-stroke": "hsl(var(--border))",
    "--xy-node-background-color": "transparent",
    "--xy-node-border": "0",
    "--xy-node-color": "hsl(var(--foreground))",
} as CSSProperties
/** Altura menor dos universos dentro dos cards de `/integracoes/ia`. */
export const NETWORK_CANVAS_COMPACT_CLASS = "h-[28rem]"
export const NETWORK_TOOLBAR_CLASS = "flex flex-wrap items-center gap-2"
export const NETWORK_STATS_CLASS = "pointer-events-auto absolute right-3 top-3 z-10 max-h-[calc(100%-1.5rem)] w-64 overflow-y-auto rounded-xl border bg-card/90 p-3 text-xs shadow-lg backdrop-blur"
