/**
 * Faixas de uso das barras de consumo (quota do OpenCode e recursos do servidor): verde abaixo de 60%,
 * amarelo de 60% a 84% e vermelho a partir de 85%. Módulo puro, usado no servidor e na tela.
 */

export type UsageLevel = "ok" | "warning" | "critical"

export const USAGE_WARNING_PERCENT = 60
export const USAGE_CRITICAL_PERCENT = 85
/** A partir daqui a barra vermelha pulsa (desligado com movimento reduzido). */
export const USAGE_PULSE_PERCENT = 95

export function usageLevel(percent: number): UsageLevel {
    if (percent >= USAGE_CRITICAL_PERCENT) return "critical"
    if (percent >= USAGE_WARNING_PERCENT) return "warning"
    return "ok"
}

const RANK: Readonly<Record<UsageLevel, number>> = { ok: 0, warning: 1, critical: 2 }

/** Pior faixa entre as informadas; `null` sem nenhuma. */
export function worstUsageLevel(levels: Iterable<UsageLevel>): UsageLevel | null {
    let worst: UsageLevel | null = null
    for (const level of levels) if (worst === null || RANK[level] > RANK[worst]) worst = level
    return worst
}

/** Cores por faixa (tokens do tema): barra, texto e a bolinha de status. */
export const USAGE_LEVEL_CLASSES: Readonly<Record<UsageLevel, { bar: string; text: string; dot: string }>> = {
    ok: { bar: "bg-success", text: "text-success", dot: "bg-success" },
    warning: { bar: "bg-warning", text: "text-warning", dot: "bg-warning" },
    critical: { bar: "bg-destructive", text: "text-destructive", dot: "bg-destructive" },
}

/** Bolinha sem dado confiável (carregando, erro, desatualizado). */
export const USAGE_UNKNOWN_DOT_CLASS = "bg-muted-foreground"
