"use client"

import { SubscriptionUsageHeader } from "@/features/subscription-usage/components/SubscriptionUsageHeader"
import { formatGoDateTime, formatGoUsd } from "../../go-logic"
import type { OpencodeGoUsageDto } from "../../go-types"

export { usageStatusLine as goStatusLine } from "@/features/subscription-usage/cycle-logic"

/** Dica do "Renova em": data e hora e, na soma de assinaturas com ciclos diferentes, de qual chave é o ciclo (OPE-180). */
export function goRenewalTitle(data: OpencodeGoUsageDto): string | undefined {
    if (!data.cycle) return undefined
    const base = `Renova em ${formatGoDateTime(data.cycle.endsAt)}`
    return data.scope?.cyclesDiffer && data.scope.cycleKeyName ? `${base} — renovação mais próxima entre as assinaturas somadas (chave ${data.scope.cycleKeyName})` : base
}

/** Cabeçalho da assinatura OpenCode Go (componente compartilhado) com o gasto real do ciclo discreto à direita. */
export function GoUsageHeader({ data }: { data: OpencodeGoUsageDto }) {
    return (
        <SubscriptionUsageHeader
            view={data}
            label="Uso do Go"
            renewalTitle={goRenewalTitle(data)}
            aside={
                data.realCostUsd !== null && (
                    <p className="pt-1 text-[11px] text-muted-foreground" title="Soma do custo real por dia (usage/cost-by-day) desde o início do ciclo. Não é o medidor da assinatura, que normaliza o custo pela cota de cada modelo.">
                        Gasto real no ciclo: {formatGoUsd(data.realCostUsd)}
                        {data.realCostPartial && <span data-go-cost-partial> (parcial: o gasto de alguma assinatura não pôde ser lido)</span>}
                    </p>
                )
            }
        />
    )
}
