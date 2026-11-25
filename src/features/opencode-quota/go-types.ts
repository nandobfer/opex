import type { CycleChartDto, CycleChartPointDto, UsageForecastDto, UsageMeterDto } from "@/features/subscription-usage/types"
import type { GoMeterId } from "./go-constants"

/**
 * DTO da assinatura OpenCode Go (OPE-167). Só ciclo, medidores em %, gasto real do ciclo, previsão e
 * gráfico: nenhum dado de pagamento (meio de pagamento, assinante, preços de upgrade) sai do servidor.
 */

export type OpencodeGoUsageState = "ok" | "unconfigured" | "no-key" | "error"

export type GoMeterDto = UsageMeterDto<GoMeterId>
export type GoForecastDto = UsageForecastDto
export type GoChartPointDto = CycleChartPointDto
export type GoChartDto = CycleChartDto

/** Chaves e assinaturas consideradas na leitura (OPE-180). Só nomes: nunca ids secretos nem dados de pagamento. */
export interface GoKeyScopeDto {
    /** `all` = "Todas as chaves" (soma das chaves em uso); `key` = uma chave do filtro. */
    mode: "all" | "key"
    /** Chaves lidas com sucesso; `subscription` = índice da assinatura (chaves com status idêntico dividem o índice). */
    keys: { name: string; subscription: number }[]
    subscriptions: number
    /** Chaves cuja leitura falhou: ficaram fora da soma. */
    failed: { name: string; message: string }[]
    /** Chave cujo ciclo rege gráfico e previsão (renovação mais próxima), com mais de uma assinatura. */
    cycleKeyName: string | null
    /** As assinaturas somadas têm ciclos diferentes. */
    cyclesDiffer: boolean
}

export interface OpencodeGoUsageDto {
    state: OpencodeGoUsageState
    message: string | null
    /** Leitura do status (medidores). */
    checkedAt: string
    /** Nome da chave do filtro ou da única chave lida; `null` na soma de várias. */
    keyName: string | null
    scope: GoKeyScopeDto | null
    cycle: { startsAt: string; endsAt: string } | null
    meters: GoMeterDto[]
    monthPercent: number | null
    limitReached: boolean
    forecast: GoForecastDto | null
    /** Gasto real (US$) no ciclo atual, do `cost-by-day`; não é o medidor. */
    realCostUsd: number | null
    /** O gasto real de alguma assinatura não pôde ser lido: o total é só das que responderam. */
    realCostPartial: boolean
    chart: GoChartDto | null
    /** Por que o gráfico não pôde ser montado (ex.: catálogo indisponível). */
    chartMessage: string | null
}
