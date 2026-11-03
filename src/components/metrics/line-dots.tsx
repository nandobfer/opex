import { isSmallSample, sampleOf, type LineSample } from "./line-chart-model"

interface DotProps {
    cx?: number | null
    cy?: number | null
    index?: number
    value?: unknown
}

/**
 * Marcador dos pontos de uma série: cheio quando a amostra é representativa, vazado (contorno na cor
 * da série, miolo na cor do card) quando o n do bucket é menor que o mínimo. Bucket sem valor não
 * tem marcador (a linha só o atravessa). A fábrica é chamada uma vez por série (`useMemo`).
 */
export function makeSampleDot(seriesKey: string, color: string, samples: readonly LineSample[], minSample: number | null) {
    return function SampleDot({ cx, cy, index, value }: DotProps) {
        const key = `${seriesKey}-${index ?? 0}`
        if (typeof cx !== "number" || typeof cy !== "number" || value === null || value === undefined) return <g key={key} />
        const hollow = isSmallSample(sampleOf(samples[index ?? -1], seriesKey), minSample)
        return <circle key={key} cx={cx} cy={cy} r={hollow ? 3.5 : 3} stroke={color} strokeWidth={hollow ? 1.5 : 1} fill={hollow ? "var(--color-card)" : color} data-dot={hollow ? "hollow" : "filled"} />
    }
}
