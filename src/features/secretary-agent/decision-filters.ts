import { urlFilterCodecs, type UrlFilterCodec, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { dayCodec, dayRangeParams } from "@/lib/list/day-filter"
import { SECRETARY_DECISION_LABELS, SECRETARY_DECISIONS, type SecretaryDecision } from "./constants"

/**
 * Filtros da aba Decisões do Agente Secretário (OPE-197): **Conversa**, **Decisão** e **Período** (decisão do dono,
 * 26/11/2026, D9). Sem campo de busca (D10): o seletor de conversa, que tem busca, atende o "campo de busca" pedido.
 * Tudo vive na URL, com chaves próprias para não colidir com `aba`/`secao`/`conversa`. Módulo puro.
 */

export interface DecisionFilters {
    conversas: string[]
    decisoes: SecretaryDecision[]
    /** Início do período (`yyyy-MM-dd`; vazio = sem início). */
    de: string
    ate: string
}

export type DecisionListParams = Partial<Record<"jid" | "decision" | "from" | "to", string>>

export const DEFAULT_DECISION_FILTERS: DecisionFilters = { conversas: [], decisoes: [], de: "", ate: "" }

const JID = /^[^@\s,]+@[a-z.]+$/
const jidList: UrlFilterCodec<string[]> = {
    parse: (raw, fallback) => (raw === null ? fallback : raw.split(",").map((value) => value.trim()).filter((value) => JID.test(value))),
    serialize: (value) => value.join(","),
}

export const DECISION_FILTER_SCHEMA: UrlFilterSchema<DecisionFilters> = {
    conversas: jidList,
    decisoes: urlFilterCodecs.strings<SecretaryDecision>(SECRETARY_DECISIONS),
    de: dayCodec,
    ate: dayCodec,
}

export const DECISION_OPTIONS = SECRETARY_DECISIONS.map((value) => ({ value, label: SECRETARY_DECISION_LABELS[value] }))

export function hasDecisionFilters(filters: DecisionFilters): boolean {
    return Boolean(filters.de || filters.ate || filters.conversas.length || filters.decisoes.length)
}

export function toDecisionListParams(filters: DecisionFilters): DecisionListParams {
    const params: DecisionListParams = {}
    if (filters.conversas.length) params.jid = filters.conversas.join(",")
    if (filters.decisoes.length) params.decision = filters.decisoes.join(",")
    return { ...params, ...dayRangeParams(filters.de, filters.ate) }
}
