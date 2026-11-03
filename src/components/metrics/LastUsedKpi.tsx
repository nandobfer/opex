"use client"

import { useState } from "react"
import { format } from "date-fns"
import { formatRelativePast } from "@/lib/relative-time"
import { KpiCard } from "./KpiCard"

/**
 * KPI **Último uso**: data e hora (`dd/MM/yyyy HH:mm`) com o tempo relativo abaixo ("há 3 dias").
 * Sem nenhum uso, "Nunca usado". Ignora o período escolhido.
 */
export function LastUsedKpi({ at, now }: { at: string | null; now?: Date }) {
    const [renderedAt] = useState(() => Date.now())
    return (
        <KpiCard label="Último uso" hint={at ? formatRelativePast(at, now ?? renderedAt) : "Sem execuções registradas"} value={null} formatter={String}>
            <p className="font-mono text-xl font-bold text-foreground">{at ? format(new Date(at), "dd/MM/yyyy HH:mm") : <span className="text-base text-muted-foreground">Nunca usado</span>}</p>
        </KpiCard>
    )
}
