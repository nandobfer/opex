"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { USAGE_GROUPS } from "../../../constants"
import { AUDIT_HELP, USAGE_GROUP_HELP } from "../../../help/operation"
import type { UsageReport } from "../../../types"
import { useEngramindQuery } from "../../../hooks/useEngramind"
import { dayToIso } from "../../shared/FilterSelect"
import { Section } from "../../shared/Section"

const GROUP_LABELS: Record<string, string> = { day: "Dia", agent: "Agente", operation: "Operação", channel: "Canal" }

/** Consumo (`get_usage`): requisições, memórias e tokens renderizados, agrupados (padrão: 7 dias). */
export function UsageCard() {
    const [groupBy, setGroupBy] = useState<(typeof USAGE_GROUPS)[number]>("day")
    const [since, setSince] = useState("")
    const [until, setUntil] = useState("")
    const usage = useEngramindQuery<UsageReport>("usage", { group_by: groupBy, since: dayToIso(since), until: dayToIso(until, true) })
    const total = usage.data?.total
    return (
        <Section title="Consumo" info={AUDIT_HELP.usage}>
            <div className="grid gap-2 sm:grid-cols-3">
                <OptionTabs aria-label="Agrupar por" size="xs" options={USAGE_GROUPS.map((group) => ({ value: group, label: GROUP_LABELS[group]!, tooltip: USAGE_GROUP_HELP[group] }))} value={groupBy} onChange={setGroupBy} />
                <Input type="date" aria-label="Desde" value={since} onChange={(event) => setSince(event.target.value)} className="h-8 bg-transparent text-xs" />
                <Input type="date" aria-label="Até" value={until} onChange={(event) => setUntil(event.target.value)} className="h-8 bg-transparent text-xs" />
            </div>
            {usage.error ? (
                <p className="text-sm text-destructive">Não foi possível carregar o consumo.</p>
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                        {(["requests", "memories", "rendered_tokens"] as const).map((key) => (
                            <div key={key} className="rounded-lg border p-2">
                                <p className="text-lg font-semibold">
                                    <AnimatedNumber value={total?.[key] ?? 0} formatter={(value) => Math.round(value).toLocaleString("pt-BR")} />
                                </p>
                                <p className="text-[11px] text-muted-foreground">{key === "requests" ? "requisições" : key === "memories" ? "memórias" : "tokens renderizados"}</p>
                            </div>
                        ))}
                    </div>
                    <ul className="max-h-64 divide-y overflow-auto rounded-lg border text-xs">
                        {(usage.data?.rows ?? []).map((row) => (
                            <li key={row.key} className="flex flex-wrap gap-2 p-2">
                                <span className="font-mono">{row.label ?? row.key}</span>
                                <span className="ml-auto text-muted-foreground">
                                    {row.requests} req · {row.memories} mem · {row.rendered_tokens} tokens
                                </span>
                            </li>
                        ))}
                        {usage.data && usage.data.rows.length === 0 && <li className="p-2 text-muted-foreground">Sem uso no período.</li>}
                    </ul>
                </>
            )}
        </Section>
    )
}
