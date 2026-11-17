"use client"

import { useMemo } from "react"
import { OpencodeGoSubscriptionCard } from "@/features/opencode-quota/components/go/OpencodeGoSubscriptionCard"
import { usageProviderReportsCost, usageRangeQuery, withUsageKey } from "../provider-usage"
import { useUsageKeyFilter } from "../hooks/useUsageKeyFilter"
import { useUsageRange } from "../hooks/useUsageRange"
import { ProviderUsageCard } from "./ProviderUsageCard"
import { UsageFiltersBar } from "./UsageFiltersBar"

/**
 * Aba Consumo do OpenCode Go (OPE-167): os filtros (período e chave, na URL) uma vez só, acima da
 * assinatura lida do Console e do uso medido do Opex — os dois cards leem os mesmos filtros.
 */
export function OpencodeGoUsageTab() {
    const { range, setRange } = useUsageRange()
    const usageKey = useUsageKeyFilter("opencode-go")
    const query = useMemo(() => withUsageKey(usageRangeQuery(range.usageFrom, range.usageTo), usageKey.value), [range.usageFrom, range.usageTo, usageKey.value])

    return (
        <div className="flex flex-col gap-6">
            <UsageFiltersBar range={range} onRangeChange={setRange} keyFilter={usageKey} />
            <OpencodeGoSubscriptionCard query={query} />
            <ProviderUsageCard
                provider="opencode-go"
                title="Consumo do OpenCode Go pelo Opex"
                description="Uso originado pelo Opex, separado por recurso (feature ou agente de IA). O custo é o informado pelo Go em cada resposta: o que saiu da cota da assinatura mais o cobrado como Extra Usage. O histórico anterior ao início da medição não é somado."
                firstColumnLabel="Recurso"
                emptyTitle="Nenhum uso do OpenCode Go neste período"
                showCost={usageProviderReportsCost("opencode-go")}
                showCoverage
                keyFilter="opencode-go"
                hideFilters
            />
        </div>
    )
}
