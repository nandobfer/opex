"use client"

import { CommandCodeSubscriptionCard } from "@/features/command-code-usage/components/CommandCodeSubscriptionCard"
import { SubscriptionUsageTab } from "./SubscriptionUsageTab"

/**
 * Aba Consumo do Command Code (OPE-190): os filtros (período e chave, na URL) uma vez só, acima da assinatura lida
 * da API da CLI e do uso medido do Opex. Se a assinatura não for legível, o consumo do Opex continua abaixo.
 */
export function CommandCodeUsageTab() {
    return (
        <SubscriptionUsageTab
            provider="command-code"
            renderSubscription={(query) => <CommandCodeSubscriptionCard query={query} />}
            usageTitle="Consumo do Command Code pelo Opex"
            usageDescription="Uso originado pelo Opex, separado por recurso (feature ou agente de IA). O Command Code não informa custo por requisição: a tela mostra apenas tokens. O histórico anterior ao início da medição não é somado."
            usageEmptyTitle="Nenhum uso do Command Code neste período"
        />
    )
}
