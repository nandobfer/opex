"use client"

import { useMemo, type ReactNode } from "react"
import type { AiApiKeyProviderId } from "../api-keys"
import { usageProviderReportsCost, usageRangeQuery, withUsageKey, type UsageProviderId, type UsageQuery } from "../provider-usage"
import { useUsageKeyFilter } from "../hooks/useUsageKeyFilter"
import { useUsageRange } from "../hooks/useUsageRange"
import { ProviderUsageCard } from "./ProviderUsageCard"
import { UsageFiltersBar } from "./UsageFiltersBar"

/**
 * Aba Consumo de um provedor com assinatura lida por ciclo (OpenCode Go, OPE-167; Command Code, OPE-190): os filtros
 * (período e chave, na URL) uma vez só, acima do card da assinatura e do uso medido do Opex — os dois leem os
 * mesmos filtros.
 */
export function SubscriptionUsageTab({
    provider,
    renderSubscription,
    usageTitle,
    usageDescription,
    usageEmptyTitle,
}: {
    provider: UsageProviderId & AiApiKeyProviderId
    renderSubscription: (query: UsageQuery | null) => ReactNode
    usageTitle: string
    usageDescription: string
    usageEmptyTitle: string
}) {
    const { range, setRange } = useUsageRange()
    const usageKey = useUsageKeyFilter(provider)
    const query = useMemo(() => withUsageKey(usageRangeQuery(range.usageFrom, range.usageTo), usageKey.value), [range.usageFrom, range.usageTo, usageKey.value])

    return (
        <div className="flex flex-col gap-6">
            <UsageFiltersBar range={range} onRangeChange={setRange} keyFilter={usageKey} />
            {renderSubscription(query)}
            <ProviderUsageCard
                provider={provider}
                title={usageTitle}
                description={usageDescription}
                firstColumnLabel="Recurso"
                emptyTitle={usageEmptyTitle}
                showCost={usageProviderReportsCost(provider)}
                showCoverage
                keyFilter={provider}
                hideFilters
            />
        </div>
    )
}
