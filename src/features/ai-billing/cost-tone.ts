/**
 * Cores do custo de tabela e do custo efetivo (OPE-213, módulo PURO). Decisão do dono (27/11/2026): KPIs e valores
 * que mostram os dois custos usam cores diferentes, as mesmas das séries do gráfico "Custo por dia".
 */
export type CostKind = "list" | "effective"

export const COST_KIND_TONE: Record<CostKind, { color: string; label: string }> = {
    list: { color: "var(--chart-info-1)", label: "Custo de tabela" },
    effective: { color: "var(--chart-positive-1)", label: "Custo efetivo" },
}
