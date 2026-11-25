/**
 * DTOs compartilhados das assinaturas lidas por ciclo (OpenCode Go, OPE-167; Command Code, OPE-190): medidores em %,
 * previsão e o gráfico de um ciclo. Só números e datas: nenhum dado de pagamento.
 */

export interface UsageMeterDto<Id extends string = string> {
    id: Id
    label: string
    /** Percentual usado com uma casa (truncado), 0 a 100+. */
    percent: number
    resetsAt: string | null
}

export interface UsageForecastDto {
    /** Média diária do ciclo em pontos percentuais. */
    dailyAverage: number | null
    /** % previsto até a renovação (pode passar de 100); `null` sem previsão. */
    projectedPercent: number | null
    /** Quando a previsão cruza o teto (100%), se for antes da renovação. */
    crossesAt: string | null
}

export interface CycleChartPointDto {
    /** Instante do ponto (ms): início do ciclo, fim de cada dia UTC, "agora" ou a renovação. */
    t: number
    /** Dia UTC `YYYY-MM-DD` a que o ponto se refere. */
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

export interface CycleChartDto {
    /** Ciclo exibido (um por vez): o atual ou o anterior que contém o fim do filtro. */
    cycle: { startsAt: string; endsAt: string; current: boolean }
    points: CycleChartPointDto[]
    /** Ponta de hoje no ciclo atual (o valor do medidor). */
    today: { t: number; percent: number } | null
    /** Cruzamento da previsão com o teto de 100%; `label` = data em São Paulo (a mesma do cabeçalho). */
    crossing: { t: number; value: number; label: string } | null
    forecastEnd: { t: number; percent: number } | null
    yMax: number
    /** Dias do ciclo sem dados (fora do histórico da API ou com falha), contados como 0 no acumulado. */
    missingDays: number
    /** Dias com dado parcial (fonte incompleta), somados com o que se conhece. */
    partialDays: number
    /** Dias somados em que alguma assinatura ficou sem dados (contou 0). */
    incompleteDays: number
    /** Primeiro dia que a API ainda devolve. */
    historyFrom: string
}

/** O que o cabeçalho do card consome (% do mês, renovação, previsão e o valor em US$ discreto). */
export interface UsageHeaderView {
    monthPercent: number | null
    limitReached: boolean
    forecast: UsageForecastDto | null
    cycle: { startsAt: string; endsAt: string } | null
}
