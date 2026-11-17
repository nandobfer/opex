/**
 * Assinatura OpenCode Go (OPE-167): constantes da visão de consumo lida da API do Console (módulo PURO).
 * Independente do painel "Quota do OpenCode" (plugin do host).
 */

/** Evento em `private-app` quando os percentuais da assinatura mudam (payload `{ checkedAt }`). */
export const OPENCODE_GO_USAGE_UPDATED_EVENT = "opencode-go-usage-updated"
export const OPENCODE_GO_USAGE_QUERY_KEY = "opencode-go-usage"

/** Status lido há menos que isto é reaproveitado numa consulta da tela. */
export const GO_STATUS_CACHE_MS = 60_000
/** Intervalo mínimo entre duas leituras forçadas pelo botão Atualizar. */
export const GO_MIN_REFRESH_MS = 30_000
/** Dia cuja leitura falhou (429, Cloudflare, rede) não é reconsultado antes disto: evita repetir a rajada a cada leitura. */
export const GO_FAILED_DAY_CACHE_MS = 90_000
/** Dias recentes (hoje e ontem) e o gasto real do ciclo ficam 10 min em memória. */
export const GO_RECENT_DAY_CACHE_MS = 10 * 60_000
/** Dias fechados não mudam mais: ficam 6 h em memória. */
export const GO_CLOSED_DAY_CACHE_MS = 6 * 60 * 60_000
/** Chamadas simultâneas ao Console ao montar a série diária. */
export const GO_SERIES_CONCURRENCY = 5
/**
 * Histórico que o Console devolve (dias UTC antes de hoje). A API anuncia ~40 dias; em 16/11/2026 a janela
 * observada ia de 05/10 a 16/11 (hoje − 42). Dia mais antigo volta vazio, sem erro: não é consultado e
 * conta como "sem dados".
 */
export const GO_HISTORY_DAYS = 42
/** Prazo de cada chamada ao Console. */
export const GO_REQUEST_TIMEOUT_MS = 15_000
/** Sem leitura nova há mais que isto, a tela marca "Desatualizado" (3 ciclos da rotina de 5 min). */
export const GO_STALE_AFTER_MS = 15 * 60_000

export const GO_METER_LABELS = { fiveHour: "5h", week: "Semanal", month: "Mensal" } as const
export type GoMeterId = keyof typeof GO_METER_LABELS
export const GO_METER_IDS = ["fiveHour", "week", "month"] as const satisfies readonly GoMeterId[]

/** Fuso de exibição; também converte o período do filtro (datas locais) em dias. */
export const GO_DISPLAY_TIME_ZONE = "America/Sao_Paulo"
