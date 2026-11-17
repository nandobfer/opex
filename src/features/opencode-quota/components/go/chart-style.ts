import { SEMANTIC_COLORS } from "@/components/metrics/charts/palette"

/**
 * Cores e traços do gráfico da assinatura (desenho do Console do OpenCode Go). No SVG só entram cores prontas:
 * as variáveis com prefixo do tema (`--color-*`, ex.: `hsl(var(--muted-foreground))`) ou as de gráfico
 * (`--chart-*`). As variáveis base (`--foreground`, `--muted-foreground`, `--border`, `--card`) guardam só os
 * números do HSL: num `fill`/`stroke` viram cor inválida (texto preto, traço que some).
 */
export const GO_USAGE_COLOR = SEMANTIC_COLORS.green
export const GO_FORECAST_COLOR = SEMANTIC_COLORS.yellow
/** Teto mensal (100%): pontilhado, mais claro e mais grosso que a grade, para destacar. */
export const GO_CEILING_COLOR = "var(--color-foreground)"
export const GO_CEILING_OPACITY = 0.7
export const GO_CEILING_DASH = "2 4"
export const GO_GRID_COLOR = "var(--color-border)"
export const GO_GRID_OPACITY = 0.5
export const GO_MUTED_COLOR = "var(--color-muted-foreground)"
/** Miolo dos círculos vazados (a cor do card). */
export const GO_CARD_COLOR = "var(--color-card)"
