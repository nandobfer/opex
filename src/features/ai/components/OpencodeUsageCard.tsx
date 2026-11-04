"use client"

import { ProviderUsageCard } from "./ProviderUsageCard"

/** Painel de consumo do OpenCode: uso medido separado por origem (feature, refinamento, mesa) e total. */
export function OpencodeUsageCard() {
    return (
        <ProviderUsageCard
            provider="opencode"
            title="Consumo do OpenCode"
            description="Uso originado pelo Opex, separado por origem (features de IA, refinamentos e mesas de desenvolvimento). A medição começou com este painel: o consumo anterior não é somado."
            firstColumnLabel="Origem"
            emptyTitle="Nenhum uso do OpenCode neste período"
            showCoverage
        />
    )
}
