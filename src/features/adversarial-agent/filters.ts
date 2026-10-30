import { urlFilterCodecs, type UrlFilterCodec, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { dayCodec, dayRangeParams } from "@/lib/list/day-filter"
import {
    ADVERSARIAL_DECISION_LABELS,
    ADVERSARIAL_DECISIONS,
    ADVERSARIAL_LEVEL_DEFS,
    ADVERSARIAL_LEVELS,
    ADVERSARIAL_REVIEW_STATE_LABELS,
    ADVERSARIAL_REVIEW_STATES,
    type AdversarialDecision,
    type AdversarialLevel,
    type AdversarialReviewState,
} from "./constants"

/**
 * Filtros da página Agente Adversário (`/agente-adversario`): busca, situação, decisão, criticidade,
 * central e período. Tudo vive na URL (`useUrlFilters`) e vai à API, que faz o recorte. Módulo puro.
 */

export interface AdversarialReviewFilters {
    /** Busca no código e no título da tarefa. */
    q: string
    states: AdversarialReviewState[]
    decisions: AdversarialDecision[]
    levels: AdversarialLevel[]
    /** Ids das centrais. */
    centrals: string[]
    /** Início do período (`yyyy-MM-dd`; vazio = sem início). */
    from: string
    /** Fim do período (`yyyy-MM-dd`; vazio = sem fim). */
    to: string
}

/** Parâmetros de `GET /api/adversarial/reviews` (listas em CSV, datas ISO; ausente = sem recorte). */
export type AdversarialReviewListParams = Partial<Record<"q" | "states" | "decisions" | "levels" | "centrals" | "from" | "to" | "limit", string>>

export const DEFAULT_ADVERSARIAL_REVIEW_FILTERS: AdversarialReviewFilters = { q: "", states: [], decisions: [], levels: [], centrals: [], from: "", to: "" }

const OBJECT_ID = /^[a-f\d]{24}$/i

/** Ids de central da URL: só os bem formados sobrevivem (a API valida a mesma regra). */
export const centralIdList: UrlFilterCodec<string[]> = {
    parse: (raw, fallback) => (raw === null ? fallback : raw.split(",").map((value) => value.trim()).filter((value) => OBJECT_ID.test(value))),
    serialize: (value) => value.join(","),
}

export const ADVERSARIAL_REVIEW_FILTER_SCHEMA: UrlFilterSchema<AdversarialReviewFilters> = {
    q: urlFilterCodecs.string(),
    states: urlFilterCodecs.strings<AdversarialReviewState>(ADVERSARIAL_REVIEW_STATES),
    decisions: urlFilterCodecs.strings<AdversarialDecision>(ADVERSARIAL_DECISIONS),
    levels: urlFilterCodecs.strings<AdversarialLevel>(ADVERSARIAL_LEVELS),
    centrals: centralIdList,
    from: dayCodec,
    to: dayCodec,
}

export const ADVERSARIAL_STATE_OPTIONS = ADVERSARIAL_REVIEW_STATES.map((value) => ({ value, label: ADVERSARIAL_REVIEW_STATE_LABELS[value] }))
export const ADVERSARIAL_DECISION_OPTIONS = ADVERSARIAL_DECISIONS.map((value) => ({ value, label: ADVERSARIAL_DECISION_LABELS[value] }))
export const ADVERSARIAL_LEVEL_OPTIONS = ADVERSARIAL_LEVELS.map((value) => ({ value, label: ADVERSARIAL_LEVEL_DEFS[value].label }))

/** Há algum recorte? Decide o estado vazio e a ação "Limpar filtros". */
export function hasAdversarialReviewFilters(filters: AdversarialReviewFilters): boolean {
    return Boolean(filters.q.trim() || filters.from || filters.to) || [filters.states, filters.decisions, filters.levels, filters.centrals].some((list) => list.length > 0)
}

/** Filtros da tela → parâmetros da API (período do dia inteiro no fuso do navegador, em ISO). */
export function toAdversarialReviewListParams(filters: AdversarialReviewFilters): AdversarialReviewListParams {
    const params: AdversarialReviewListParams = {}
    const q = filters.q.trim()
    if (q) params.q = q
    if (filters.states.length) params.states = filters.states.join(",")
    if (filters.decisions.length) params.decisions = filters.decisions.join(",")
    if (filters.levels.length) params.levels = filters.levels.join(",")
    if (filters.centrals.length) params.centrals = filters.centrals.join(",")
    return { ...params, ...dayRangeParams(filters.from, filters.to) }
}
