/**
 * Assinatura Command Code (OPE-190): constantes da visão de consumo lida da API da CLI (`/alpha/*`), módulo PURO.
 */

/** Evento em `private-app` quando os percentuais da assinatura mudam (payload `{ checkedAt }`). */
export const COMMAND_CODE_USAGE_UPDATED_EVENT = "command-code-usage-updated"
export const COMMAND_CODE_USAGE_QUERY_KEY = "command-code-usage"

/** Leitura da conta (créditos, assinatura, totais do ciclo) mais nova que isto é reaproveitada numa consulta da tela. */
export const CC_READ_CACHE_MS = 60_000
/** Intervalo mínimo entre duas leituras forçadas pelo botão Atualizar. */
export const CC_MIN_REFRESH_MS = 30_000
/** Dia cuja leitura falhou não é reconsultado antes disto. */
export const CC_FAILED_DAY_CACHE_MS = 90_000
/** Hoje fica 10 min em memória. */
export const CC_RECENT_DAY_CACHE_MS = 10 * 60_000
/** Dias fechados não mudam mais: ficam 6 h em memória. */
export const CC_CLOSED_DAY_CACHE_MS = 6 * 60 * 60_000
/** Leituras simultâneas de `usage/summary?since=` ao montar a série diária. */
export const CC_SERIES_CONCURRENCY = 5
/** Contas lidas ao mesmo tempo em "Todas as chaves". */
export const CC_READ_CONCURRENCY = 4
/** Prazo de cada chamada à API da CLI. */
export const CC_REQUEST_TIMEOUT_MS = 15_000
/** Sem leitura nova há mais que isto, a tela marca "Desatualizado" (3 ciclos da rotina de 5 min). */
export const CC_STALE_AFTER_MS = 15 * 60_000

export const CC_METER_LABELS = { fiveHour: "5h", weekly: "Semanal", month: "Mensal" } as const
export type CcMeterId = keyof typeof CC_METER_LABELS
export const CC_WINDOW_IDS = ["fiveHour", "weekly"] as const satisfies readonly CcMeterId[]
