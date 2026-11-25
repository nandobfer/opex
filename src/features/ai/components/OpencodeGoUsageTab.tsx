"use client"

import { OpencodeGoSubscriptionCard } from "@/features/opencode-quota/components/go/OpencodeGoSubscriptionCard"
import { SubscriptionUsageTab } from "./SubscriptionUsageTab"

/**
 * Aba Consumo do OpenCode Go (OPE-167): os filtros (período e chave, na URL) uma vez só, acima da
 * assinatura lida do Console e do uso medido do Opex — os dois cards leem os mesmos filtros.
 */
export function OpencodeGoUsageTab() {
    return (
        <SubscriptionUsageTab
            provider="opencode-go"
            renderSubscription={(query) => <OpencodeGoSubscriptionCard query={query} />}
            usageTitle="Consumo do OpenCode Go pelo Opex"
            usageDescription="Uso originado pelo Opex, separado por recurso (feature ou agente de IA). O custo é o informado pelo Go em cada resposta: o que saiu da cota da assinatura mais o cobrado como Extra Usage. O histórico anterior ao início da medição não é somado."
            usageEmptyTitle="Nenhum uso do OpenCode Go neste período"
        />
    )
}
