import { SEMANTIC_COLORS, SINGLE_MEASURE_COLOR, type SemanticTone, type SeriesDash } from "@/components/metrics/charts/palette"
import type { MetricBarChartDto, MetricLineChartInput } from "./types"

/**
 * Cores e traços por significado das séries dos agentes (módulo puro). Decisão do dono na OPE-141,
 * porte do MT-40 do my-tasks: a mesma métrica tem a mesma cor e o mesmo traço em todos os agentes.
 * Positivas em verde/azul, informativas em roxo/rosa/branco e negativas por criticidade (vermelho >
 * laranja > amarelo); linhas com a mesma cor no mesmo gráfico se diferenciam pelo traço. Série sem
 * significado mantém a cor pela posição (`lineStyleAt`, OPE-122). Chaves só do Opex: `ignored`
 * (bloqueios ignorados do Adversário, `skipped` no my-tasks), `errors` (agentes rotineiros) e as
 * linhas Dono/Portal das conversas (`owner` roxo e `portal` rosa, ambos cheios: decisão do dono).
 */
export const SERIES_STYLE: Readonly<Record<string, readonly [SemanticTone, SeriesDash]>> = {
    // Positivas
    oneShot: ["green", "solid"],
    ciFixed: ["blue", "solid"],
    completed: ["green", "solid"],
    summary: ["green", "solid"],
    withinMargin: ["green", "solid"],
    firstApproval: ["green", "solid"],
    done: ["green", "solid"],
    tags: ["blue", "solid"],
    approved: ["blue", "solid"],
    accepted: ["blue", "solid"],
    // Regressão (crítico) e bloqueios
    regression: ["red", "solid"],
    reopened: ["red", "dashed"],
    regressionFinding: ["red", "dotted"],
    previewCorrection: ["orange", "dashed"],
    blocked: ["orange", "solid"],
    blocking: ["orange", "solid"],
    skipped: ["red", "solid"],
    ignored: ["red", "solid"],
    // Moderadas
    conflict: ["yellow", "solid"],
    ciFailed: ["yellow", "dashed"],
    retried: ["yellow", "dotted"],
    corrected: ["yellow", "solid"],
    // Informativas
    interrupted: ["pink", "solid"],
    resumed: ["pink", "dashed"],
    lesson: ["purple", "solid"],
    lessons: ["purple", "solid"],
    confirmed: ["purple", "solid"],
    withTools: ["pink", "solid"],
    nodes: ["purple", "solid"],
    edges: ["pink", "solid"],
    owner: ["purple", "solid"],
    portal: ["pink", "solid"],
    // Falhas
    failures: ["red", "solid"],
    failed: ["red", "solid"],
    failedReplies: ["red", "solid"],
    errors: ["red", "solid"],
    meanError: ["orange", "solid"],
}

/** Achados do Adversário por categoria (gráfico `categories`), da mais à menos crítica. */
export const CATEGORY_STYLE: Readonly<Record<string, readonly [SemanticTone, SeriesDash]>> = {
    security: ["red", "solid"],
    bug: ["red", "dashed"],
    regression: ["red", "dotted"],
    data: ["orange", "solid"],
    requirement: ["orange", "dashed"],
    "error-handling": ["orange", "dotted"],
    "edge-case": ["yellow", "solid"],
    tests: ["yellow", "dashed"],
    "project-rule": ["yellow", "dotted"],
    design: ["white", "solid"],
    consistency: ["white", "dashed"],
    style: ["white", "dotted"],
}

/** Destino das lições do Mentor (ranking por série). */
export const MENTOR_TARGET_TONES: Readonly<Record<string, SemanticTone>> = { adversarial: "purple", "developer-global": "pink", "developer-central": "white" }

/** Somas de uma medida só (Tokens por data): roxo contínuo. */
const SINGLE_MEASURE_LINES = new Set(["tokens"])

export function seriesStyle(key: string, chartId?: string): { color: string; dash: SeriesDash } | null {
    if (chartId && SINGLE_MEASURE_LINES.has(chartId)) return { color: SINGLE_MEASURE_COLOR, dash: "solid" }
    const style = chartId === "categories" ? CATEGORY_STYLE[key] : SERIES_STYLE[key]
    return style ? { color: SEMANTIC_COLORS[style[0]], dash: style[1] } : null
}

/** Aplica a cor e o traço por significado às séries de um gráfico de linhas. */
export function styleLineChart(chart: MetricLineChartInput): MetricLineChartInput {
    return { ...chart, series: chart.series.map((item) => ({ ...item, ...(seriesStyle(item.key, chart.id) ?? {}) })) }
}

/** Rankings por série (Destino das lições) seguem a cor da série; os de medida única ficam roxos (cor do card). */
export function styleBarChart(chart: MetricBarChartDto): MetricBarChartDto {
    if (chart.id !== "targets") return chart
    return { ...chart, items: chart.items.map((item) => ({ ...item, color: MENTOR_TARGET_TONES[item.key] ? SEMANTIC_COLORS[MENTOR_TARGET_TONES[item.key]!] : null })) }
}
