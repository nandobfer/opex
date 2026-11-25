import type { CycleChartDto, UsageForecastDto, UsageMeterDto } from "@/features/subscription-usage/types"
import type { CcMeterId } from "./constants"

/**
 * DTO da assinatura Command Code (OPE-190). Só ciclo, medidores em %, valores em US$ do ciclo, previsão e gráfico:
 * nenhum dado pessoal (nome, e-mail) nem de cobrança sai do servidor.
 */

/** `unavailable` = a API da CLI não respondeu o endpoint (404) ou mudou de formato: a assinatura não é legível. */
export type CommandCodeUsageState = "ok" | "unconfigured" | "no-key" | "error" | "unavailable"

/** Chaves e contas consideradas na leitura. Só nomes: nunca ids da conta nem segredos. */
export interface CcKeyScopeDto {
    mode: "all" | "key"
    /** Chaves lidas com sucesso; `account` = índice da conta (chaves da mesma conta dividem o índice). */
    keys: { name: string; account: number }[]
    accounts: number
    failed: { name: string; message: string }[]
    /** Chave cujo ciclo rege gráfico e previsão (renovação mais próxima), com mais de uma conta. */
    cycleKeyName: string | null
    cyclesDiffer: boolean
}

export interface CommandCodeUsageDto {
    state: CommandCodeUsageState
    message: string | null
    checkedAt: string
    keyName: string | null
    scope: CcKeyScopeDto | null
    /** Plano informado (`individual-goat`…); só o id. */
    planId: string | null
    cycle: { startsAt: string; endsAt: string } | null
    meters: UsageMeterDto<CcMeterId>[]
    monthPercent: number | null
    limitReached: boolean
    forecast: UsageForecastDto | null
    /** Valor das requisições no ciclo a preço de API (`totalCost`), não o cobrado. */
    usageValueUsd: number | null
    usageValuePartial: boolean
    /** Créditos extras restantes (comprados + gratuitos). */
    extraCreditsUsd: number | null
    /** Sem janelas de uso nem pool mensal (ex.: plano Provider, pago por uso). */
    noWindows: boolean
    chart: CycleChartDto | null
    chartMessage: string | null
}
