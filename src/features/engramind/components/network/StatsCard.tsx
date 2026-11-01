"use client"

import { BarChart3 } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { NETWORK_STATS_CLASS } from "./layout-classes"

export interface StatRow {
    label: string
    value: number | string
    testId?: string
}

/** Card de estatísticas do que está sendo visto (todas as visões); números animados. */
export function StatsCard({ title, rows, children }: { title: string; rows: StatRow[]; children?: React.ReactNode }) {
    return (
        <section aria-label="Estatísticas" data-testid="network-stats" className={NETWORK_STATS_CLASS}>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <BarChart3 className="h-3.5 w-3.5 text-primary" aria-hidden /> {title}
            </h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                {rows.map((row) => (
                    <div key={row.label} className="contents">
                        <dt className="text-muted-foreground">{row.label}</dt>
                        <dd className="text-right font-medium tabular-nums text-foreground" data-testid={row.testId}>
                            {typeof row.value === "number" ? <AnimatedNumber value={row.value} /> : row.value}
                        </dd>
                    </div>
                ))}
            </dl>
            {children}
        </section>
    )
}

/** Lista "nome → total" (por canal, por agente) dentro do card. */
export function StatList({ title, items, colors, testId }: { title: string; items: { key: string; label: string; count: number }[]; colors?: Map<string, string>; testId?: string }) {
    if (!items.length) return null
    return (
        <div className="mt-3 border-t pt-2" data-testid={testId}>
            <p className="mb-1 font-semibold text-foreground">{title}</p>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
                {items.map((item) => (
                    <li key={item.key} className="flex items-center gap-1.5">
                        {colors && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors.get(item.key) }} />}
                        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={item.label}>
                            {item.label}
                        </span>
                        <span className="tabular-nums text-foreground">
                            <AnimatedNumber value={item.count} />
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
