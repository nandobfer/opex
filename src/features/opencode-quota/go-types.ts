import type { GoMeterId } from "./go-constants"

/**
 * DTO da assinatura OpenCode Go (OPE-167). Só ciclo, medidores em %, gasto real do ciclo, previsão e
 * gráfico: nenhum dado de pagamento (meio de pagamento, assinante, preços de upgrade) sai do servidor.
 */

export type OpencodeGoUsageState = "ok" | "unconfigured" | "no-key" | "error"

export interface GoMeterDto {
    id: GoMeterId
    label: string
    /** Percentual usado com uma casa (truncado, como o Console), 0 a 100+. */
    percent: number
    resetsAt: string | null
}

export interface GoForecastDto {
    /** Média diária do ciclo em pontos percentuais. */
    dailyAverage: number | null
    /** % previsto até a renovação (pode passar de 100); `null` sem previsão. */
    projectedPercent: number | null
    /** Quando a previsão cruza o teto (100%), se for antes da renovação. */
    crossesAt: string | null
}

export interface GoChartPointDto {
    /** Instante do ponto (ms): início do ciclo, fim de cada dia UTC, "agora" ou a renovação. */
    t: number
    /** Dia UTC `YYYY-MM-DD` (balde da API) a que o ponto se refere. */
    date: string
    /** Pontos percentuais do dia; `null` sem dados. */
    dayPercent: number | null
    /** Acumulado no ciclo até `t` (agora: o valor do medidor); `null` quebra a linha. */
    usage: number | null
    /** Previsão linear acumulada (de "agora" até a renovação, um ponto por dia). */
    forecast: number | null
    /** Previsão daquele dia (média diária × fração do dia que cai na previsão); `null` no trecho do uso real. */
    dayForecast: number | null
}

export interface GoChartDto {
    /** Ciclo exibido (um por vez): o atual ou o anterior que contém o fim do filtro. */
    cycle: { startsAt: string; endsAt: string; current: boolean }
    points: GoChartPointDto[]
    /** Ponta de hoje no ciclo atual (o valor do medidor). */
    today: { t: number; percent: number } | null
    /** Cruzamento da previsão com o teto de 100%; `label` = data em São Paulo (a mesma do cabeçalho). */
    crossing: { t: number; value: number; label: string } | null
    forecastEnd: { t: number; percent: number } | null
    yMax: number
    /** Dias do ciclo sem dados (fora do histórico da API ou com falha), contados como 0 no acumulado. */
    missingDays: number
    /** Dias com custo de modelo sem cota conhecida no catálogo (custo fora da soma). */
    partialDays: number
    /** Dias somados em que alguma assinatura ficou sem dados (contou 0), OPE-180. */
    incompleteDays: number
    /** Primeiro dia que a API ainda devolve. */
    historyFrom: string
}

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
