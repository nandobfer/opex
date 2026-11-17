import { SEMANTIC_COLORS } from "@/components/metrics/charts/palette"

/** Cores e traços do gráfico da assinatura (desenho do Console do OpenCode Go), por tokens do tema. */
export const GO_USAGE_COLOR = SEMANTIC_COLORS.green
export const GO_FORECAST_COLOR = SEMANTIC_COLORS.yellow
/** Teto mensal (100%): pontilhado e mais claro que a grade, para destacar. */
export const GO_CEILING_COLOR = "var(--foreground)"
export const GO_CEILING_OPACITY = 0.55
export const GO_CEILING_DASH = "2 4"
export const GO_GRID_COLOR = "var(--border)"
export const GO_MUTED_COLOR = "var(--muted-foreground)"
