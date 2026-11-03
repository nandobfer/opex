import { formatBucketLabel } from "./format"
import { sampleOf, type LineSample } from "./line-chart-model"

/** Altura do eixo X com a linha do n (data em cima, `n=5` embaixo). */
export const SAMPLE_AXIS_HEIGHT = 40

/** Rótulo do eixo X com a data e, embaixo, o n do bucket (cor apagada). */
export function SampleAxisTick({ x, y, payload, samples }: { x?: number; y?: number; payload?: { value?: unknown }; samples: readonly LineSample[] }) {
    const bucket = String(payload?.value ?? "")
    const n = sampleOf(samples.find((item) => item.bucket === bucket))
    return (
        <g transform={`translate(${x ?? 0},${y ?? 0})`}>
            <text dy={12} textAnchor="middle" className="fill-muted-foreground text-xs">
                {formatBucketLabel(bucket)}
            </text>
            <text dy={26} textAnchor="middle" className="fill-muted-foreground/60 text-[10px]">
                n={n}
            </text>
        </g>
    )
}
